import dotenv from "dotenv";
dotenv.config();

// This is now the single source of truth for the JWT secret
export const jwtSecret = process.env.JWT_SECRET || 'your-default-super-secret-key-123!';