const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const Joi = require("@hapi/joi");

const CONFIG = require("../config/index");
const table = "kv_users";

const schema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

//  all request starts with /login

router.post("/", (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  const pool = new Pool(CONFIG.DB);

  pool.query(
    `SELECT 
            id, full_name, group_id, status 
        FROM 
            ${table}
        WHERE
            username = $1 AND password = MD5(MD5(MD5($2)))
        LIMIT 1;`,
    [value.username.trim(), value.password.trim()],
    (error, results) => {
      if (error) {
        pool.end();
        return res.send({ status: 500, message: "Server error", error });
      }

      if (results.rowCount > 0) {
        pool.query(
          `UPDATE kv_users SET last_seen = NOW() WHERE username=$1 AND password=MD5(MD5(MD5($2)));`,
          [value.username.trim(), value.password.trim()],
          (err) => {
            pool.end();
            if (err) console.log(err);
          }
        );
        const token = jwt.sign({ data: results.rows }, CONFIG.SECRET, {
          expiresIn: parseInt(CONFIG.SESSION_TIMEOUT),
        });

        res.setHeader("token", token);
        return res.send({ status: 200, user: results.rows[0] });
      }

      pool.end();
      return res.send({ status: 404, message: "User not found" });
    }
  );
});

module.exports = router;
