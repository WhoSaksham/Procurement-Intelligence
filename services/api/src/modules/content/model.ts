import { model, Schema } from 'mongoose';

export const CONTENT_VIEWS = ['package', 'pipeline', 'learn'] as const;
export type ContentView = (typeof CONTENT_VIEWS)[number];

/** Illustrative per-view content, one document per view. */
export interface ContentDoc {
  _id: ContentView | 'ask';
  data: Record<string, unknown>;
}

export const ContentModel = model<ContentDoc>(
  'Content',
  new Schema<ContentDoc>({ _id: String, data: Schema.Types.Mixed }, { collection: 'content', versionKey: false, minimize: false }),
);
