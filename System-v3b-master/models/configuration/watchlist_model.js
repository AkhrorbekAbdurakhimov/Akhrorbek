const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const { DB } = require("../../config/index");
const Joi = require("@hapi/joi");

const schema = Joi.object({
  name: Joi.string().required(),
  is_allow: Joi.boolean().required(),
  ack: Joi.boolean().required(),
});

//  all request starts with /watchlist

router.get("/", (req, res) => {
  const pool = new Pool(DB);
  pool.query(
    `SELECT id AS key, name, is_allow, ack FROM kv_watchlist`,
    (err, result) => {
      pool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, data: result.rows });
    }
  );
});

router.get("/:id", (req, res) => {
  const pool = new Pool(DB);
  pool.query(
    `SELECT id AS key, name, is_allow, ack FROM kv_watchlist WHERE id = ${req.params.id}`,
    (err, result) => {
      pool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      if (result.rowCount > 0)
        return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "Watchlist not found" });
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

  const pool = new Pool(DB);

  pool.query(
    `INSERT INTO 
    kv_watchlist (name, is_allow, ack)
    VALUES
      ('${value.name}', '${value.is_allow}', '${value.ack}')`,
    (err) => {
      pool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Watchlist created" });
    }
  );
});

router.put("/", (req, res) => {
  const schemaEdit = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    is_allow: Joi.boolean().required(),
    ack: Joi.boolean().required(),
  });
  const { error, value } = schemaEdit.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  const pool = new Pool(DB);
  pool.query(
    `UPDATE kv_watchlist SET name = $1, is_allow = '${value.is_allow}', ack = '${value.ack}' WHERE id = ${value.id}`,
    [value.name],
    (err) => {
      pool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Watchlist updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  const pool = new Pool(DB);
  pool.query(`DELETE FROM kv_watchlist WHERE id = ${req.params.id}`, (err) => {
    pool.end();
    if (err) return res.send({ status: 500, message: "Internal server error" });
    return res.send({ status: 200, message: "Watchlist deleted" });
  });
});

module.exports = router;
