import mongoose from 'mongoose';

export async function connectToDatabase(uri?: string): Promise<boolean> {
  const mongoUri = uri || process.env.MONGODB_URI;
  if (!mongoUri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI environment variable is required in production.');
    }
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  await mongoose.connect(mongoUri);
  return true;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

