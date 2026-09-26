import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  CLINIC_TIMEZONE: Joi.string().default('Asia/Kolkata'),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  SEED_ADMIN_EMAIL: Joi.string().email().default('admin@drbhushan.clinic'),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).required(),
  ALLOW_REGISTRATION: Joi.boolean().default(false),
  // One-click role logins for demos (POST /api/auth/demo). Never enable in production.
  DEMO_LOGINS: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
});
