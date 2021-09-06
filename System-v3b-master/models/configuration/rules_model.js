const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const table = "kv_rules";

const schema = Joi.object({
  name: Joi.string().required(),
  sync_code: Joi.number().default("null"),
  get_code: Joi.array().items(Joi.number()),
});

//  all request starts with /rules

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
      id AS key, title AS name, sync_code, get_code 
    FROM 
      ${table} ORDER BY id ASC
    LIMIT 
      ${value.limit}
    OFFSET
      ${value.offset};`,
    (err, result) => {
      if (err) {
        req.pgPool.end();
        return res.send({ status: 500, message: "Internal server error" });
      }
      req.pgPool.query(`SELECT COUNT(*) AS total FROM ${table};`, (err, r) => {
        req.pgPool.end();
        if (err) console.log("Could not get total count");
        return res.send({
          status: 200,
          data: result.rows,
          props: r ? r.rows[0] : -1,
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

  value.get_code = value.get_code ? `ARRAY[${value.get_code}]` : null;

  req.pgPool.query(
    `INSERT INTO 
        ${table} (title, sync_code, get_code)
    VALUES
      ($1, $2, $3)`,
    [value.name, value.sync_code, value.get_code],
    (err) => {
      req.pgPool.end();
      if (err) return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Rule created" });
    }
  );
});

router.put("/", (req, res) => {
  const schema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    sync_code: Joi.number().default("null"),
    get_code: Joi.array().items(Joi.number()),
  });
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  value.get_code = value.get_code ? `ARRAY[${value.get_code}]` : null;

  req.pgPool.query(
    `UPDATE 
        ${table} 
    SET 
        title = $1, sync_code = ${value.sync_code}, get_code = ${value.get_code} WHERE id = ${value.id}`,
    [value.name],
    (err) => {
      req.pgPool.end();
      if (err) return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Rule updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  req.pgPool.query(`DELETE FROM ${table} WHERE id = ${req.params.id}`, (err) => {
    req.pgPool.end();
    if (err) return res.send({ status: 500, message: "Internal server error" });
    return res.send({ status: 200, message: "Rule deleted" });
  });
});

module.exports = router;
