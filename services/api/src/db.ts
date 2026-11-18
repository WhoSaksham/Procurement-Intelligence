import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDb(url: string): Promise<void> {
  await mongoose.connect(url, { serverSelectionTimeoutMS: 5_000 });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export const dbReady = (): boolean => mongoose.connection.readyState === 1;
