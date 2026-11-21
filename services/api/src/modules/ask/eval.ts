// `npm run eval:ask`: ask the live model each suggested question and compare with the prepared answer.
// A manual quality check before deploying (not run in CI; it spends free-tier quota).
// Needs GEMINI_API_KEY and a seeded MONGO_URL (env or services/api/.env).
import { loadConfig } from '../../config.js';
import { connectDb, disconnectDb } from '../../db.js';
import { SourceModel, toSource } from '../sources/model.js';
import { geminiModel } from './gemini.js';
import { runAsk } from './graph.js';
import { AnswerModel } from './model.js';
import { sourcePassage } from './retrieve.js';
import { supportMin } from './service.js';
import { askTracer } from './tracing.js';

const config = loadConfig();
if (!config.geminiApiKey) {
  console.error('GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and put it in services/api/.env.');
  process.exit(1);
}

await connectDb(config.mongoUrl);
try {
  const model = geminiModel({ apiKey: config.geminiApiKey, model: config.geminiModel });
  const sources = (await SourceModel.find().sort({ seq: 1 }).lean()).map((d) => sourcePassage(toSource(d)));
  const answers = (await AnswerModel.find().sort({ seq: 1 }).lean()).map(({ q, keys, claims }) => ({ q, keys, claims }));
  if (!sources.length || !answers.length) throw new Error(`No seed data in ${config.mongoUrl}; run \`npm run seed\` first.`);
  const min = await supportMin();
  // Eval runs go to the same agent (tagged eval: true), or to a separate `<project>-eval` project.
  const tracer = config.langsmith ? askTracer(config.langsmith, { projectSuffix: '-eval' }) : null;
  const where = config.langsmith?.agent ? `agent ${config.langsmith.agent.id} (${config.langsmith.agent.environment})` : `${config.langsmith?.project}-eval`;

  console.log(`Model ${config.geminiModel}; support threshold ${min}${tracer ? `; tracing to ${where}` : ''}\n`);
  let ok = 0;
  for (const a of answers) {
    const t = performance.now();
    const r = await runAsk({ q: a.q, history: [], pkg: null, sources, answers, supportMin: min, model, callbacks: tracer ? [tracer()] : undefined, metadata: { eval: true } });
    const ms = Math.round(performance.now() - t);
    const kept = r.claims.filter((c) => c.kept);
    const cited = [...new Set(kept.flatMap((c) => c.cite))].sort();
    const expected = [...new Set(a.claims.filter((c) => c.support >= min).flatMap((c) => c.cite))].sort();
    const overlap = cited.filter((id) => expected.includes(id));
    if (r.mode === 'llm' && kept.length) ok++;
    console.log(`Q: ${a.q}`);
    console.log(`   mode ${r.mode}${r.failure ? ` (${r.failure})` : ''} · ${kept.length}/${r.claims.length} kept · ${ms} ms`);
    console.log(`   cited [${cited.join(', ')}] · prepared [${expected.join(', ')}] · overlap ${overlap.length}/${expected.length}`);
    for (const c of r.claims) console.log(`   ${c.kept ? '✓' : '✗'} ${c.support.toFixed(2)} ${c.text}${c.reason ? `  (${c.reason})` : ''}`);
    console.log('');
  }
  console.log(`${ok}/${answers.length} questions answered by the live model with at least one kept claim.`);
  process.exitCode = ok === answers.length ? 0 : 1;
} finally {
  await disconnectDb();
}
