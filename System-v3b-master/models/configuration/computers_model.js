const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  name: Joi.string().required(),
  ip_address: Joi.string().required(),
  crossroad_id: Joi.number().required(),
});

//  all request starts with /computers

router.get("/all", (req, res) => {
  req.pgPool.query(
    `SELECT 
      kc.id AS key, kc.title AS name, kc.ip_address, cros.title AS c_name, to_char(last_update, 'YYYY-MM-DD HH24:MI:SS') AS last_update, kc.args,
      kc.args->>'version' AS version, to_char(kvlite, 'YYYY-MM-DD HH24:MI:SS') AS kvlite 
    FROM 
      kv_computers kc
    JOIN 
      kv_crossroads cros ON kc.crossroad_id = cros.id
    ORDER BY
      kc.ip_address ASC;`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, data: result.rows });
    }
  );
});

router.get("/", (req, res) => {
  if (req.query.crossroad_id) return getComputersToKvLite(req, res);
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
      kc.id AS key, kc.title AS name, kc.ip_address, cros.title AS c_name, kc.args->>'version' AS version, to_char(last_update, 'YYYY-MM-DD HH24:MI:SS') AS last_update, kc.args, to_char(kvlite, 'YYYY-MM-DD HH24:MI:SS') AS kvlite 
    FROM 
      kv_computers kc
    JOIN 
      kv_crossroads cros ON kc.crossroad_id = cros.id
    ORDER BY
      kc.ip_address ASC
    LIMIT 
      ${value.limit}
    OFFSET
      ${value.offset};`,
    (err, result) => {
      if (err) {
        req.pgPool.end();
        return res.send({ status: 500, message: "Internal server error" });
      }
      req.pgPool.query(
        `SELECT COUNT(*) AS total FROM kv_computers kc JOIN kv_crossroads cros ON kc.crossroad_id = cros.id;`,
        (err, r) => {
          req.pgPool.end();
          if (err) console.log("Could not get total count");
          return res.send({
            status: 200,
            data: result.rows,
            props: r ? r.rows[0] : -1,
          });
        }
      );
    }
  );
});

const getComputersToKvLite = (req, res) => {
  req.pgPool.query(
    `SELECT 
      kc.id AS key, kc.title AS name, crossroad_id, cros.title AS c_name 
    FROM 
      kv_computers kc
    JOIN 
      kv_crossroads cros ON kc.crossroad_id = cros.id
    WHERE 
      crossroad_id IN (${req.query.crossroad_id})
    ORDER BY
      cros.title ASC`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      if (result.rowCount > 0)
        return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "Computer not found" });
    }
  );
};

router.post("/", (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `INSERT INTO 
        kv_computers (title, ip_address, crossroad_id)
    VALUES
      ($1, $2, $3)`,
    [value.name, value.ip_address, value.crossroad_id],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Computer created" });
    }
  );
});

router.put("/", (req, res) => {
  const schema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    ip_address: Joi.string().required(),
    crossroad_id: Joi.number().required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `UPDATE 
        kv_computers 
    SET 
        title = $1, ip_address = $2, crossroad_id = $3 WHERE id = $4`,
    [value.name, value.ip_address, value.crossroad_id, value.id],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Computer updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  req.pgPool.query(
    `DELETE FROM kv_computers WHERE id = ${req.params.id}`,
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Computer deleted" });
    }
  );
});

module.exports = router;
