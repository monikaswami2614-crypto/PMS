import prisma from './prisma.js';

export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected successfully');
  } catch (error) {
    console.error('PostgreSQL connection failed:', error);
    console.warn('Continue with caution: database connection failed. Ensure DATABASE_URL is set and PostgreSQL is running.');
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log('PostgreSQL disconnected');
  } catch (error) {
    console.error('Error disconnecting from PostgreSQL:', error);
    throw error;
  }
};
