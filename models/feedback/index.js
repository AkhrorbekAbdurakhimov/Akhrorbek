const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  user_name: Joi.string().required(),
  phone_number: Joi.string().required(),
  msg: Joi.string().required(),
  version: Joi.string().required(),
});

//  all request starts with /feed

router.get("/", (req, res) => {
  const schema = Joi.object({
    offset: Joi.number().default(0),
    limit: Joi.number().default(10),
  });

  const { error, value } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `SELECT 
      id AS key, name, to_char(the_date, 'YYYY-MM-DD HH24:MI:SS') AS the_date, phone_number, msg, version
    FROM 
        kv_feedback
    ORDER BY
        the_date DESC OFFSET ${value.offset} LIMIT ${value.limit}`,
    (err, result) => {
      if (err) return res.send({ status: 500, message: "Internal server error" });
      req.pgPool.query("SELECT COUNT(*) FROM kv_feedback", (err, r) => {
        if (err) r.rowCount = 0;
        req.pgPool.end();
        return res.send({
          status: 200,
          data: result.rows,
          count: r.rowCount > 0 ? r.rows[0].count : 0,
        });
      });
    }
  );
});

router.post("/", (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  value.msg = value.msg.split("'").join("''");
  value.phone_number = value.phone_number.split("'").join("''");
  value.user_name = value.user_name.split("'").join("''");
  value.version = value.version.split("'").join("''");

  req.pgPool.query(
    `INSERT INTO 
        kv_feedback (name, the_date, phone_number, msg, version)
    VALUES
     ( $1, NOW(), $2, $3, $4)`,
    [value.user_name, value.phone_number, value.msg, value.version],
    (err) => {
      req.pgPool.end();
      if (err) return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Feedback created" });
    }
  );
});

router.delete("/:id", (req, res) => {
  req.pgPool.query(`DELETE FROM kv_feedback WHERE id = ${req.params.id}`, (err) => {
    req.pgPool.end();
    if (err) return res.send({ status: 500, message: "Internal server error" });
    return res.send({ status: 200, message: "Feedback deleted" });
  });
});

module.exports = router;
