require("dotenv").config();

module.exports = {
  SYSTEM: {
    PORT: process.env.SYSTEMv3_PORT,
  },

  DB: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
  },

  SECRET: process.env.SECRET,
  AES_KEY: process.env.AES_KEY,
  AES_IV: process.env.AES_IV,
  SESSION_TIMEOUT: process.env.SESSION_TIMEOUT,
  ENV: process.env.NODE_ENV,
  UPDATE_TOKEN_INTERVAL: process.env.UPDATE_TOKEN_INTERVAL,
  API_URL: process.env.API_URL,
  API_PORT: process.env.API_PORT,
  API_USERNAME: process.env.API_USERNAME,
  API_PASSWORD: process.env.API_PASSWORD,
  API_GRANT_TYPE: process.env.API_GRANT_TYPE,
  PING_INTERVAL: process.env.PING_INTERVAL,
};
