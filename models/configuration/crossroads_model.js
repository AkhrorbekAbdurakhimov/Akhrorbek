const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  name: Joi.string().required(),
  ip_address: Joi.string().required(),
  key: Joi.number().required(),
});

//  all request starts with /cross

router.get("/all", (req, res) => {
  req.pgPool.query(
    `SELECT 
      kc.id AS key, kc.title AS name, kc.ip_address, kg.title AS g_name, kc.group_id 
    FROM 
      kv_crossroads kc 
    JOIN 
      kv_groups kg ON kc.group_id = kg.id
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
      kc.id AS key, kc.title AS name, kc.ip_address, kg.title AS g_name, kc.group_id 
    FROM 
      kv_crossroads kc 
    JOIN 
      kv_groups kg ON kc.group_id = kg.id
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
        `SELECT COUNT(*) AS total FROM kv_crossroads kc JOIN kv_groups kg ON kc.group_id = kg.id;`,
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

/* Uset to get crossroads by group id for KvLit */
router.get("/:group_id", (req, res) => {
  let where =
    req.params.group_id == 1
      ? ""
      : `WHERE kc.group_id = ${req.params.group_id}`;

  req.pgPool.query(
    `SELECT 
        kc.id AS key, kc.title AS name
    FROM 
        kv_crossroads kc 
    JOIN 
        kv_groups kg ON kc.group_id = kg.id 
    ${where}
    ORDER BY
        kc.title ASC`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      if (result.rowCount > 0)
        return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "Crossroars not found" });
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

  req.pgPool.query(
    `INSERT INTO 
        kv_crossroads (title, group_id, ip_address)
    VALUES
      ($1, $2, $3)`,
    [value.name, value.key, value.ip_address],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Crossroad created" });
    }
  );
});

router.put("/", (req, res) => {
  const schema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    key: Joi.number().required(),
    ip_address: Joi.string().required(),
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
        kv_crossroads 
    SET 
        title = $1, group_id = $2, ip_address = $3 WHERE id = $4`,
    [value.name, value.key, value.ip_address, value.id],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Crossroads updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  req.pgPool.query(
    `DELETE FROM kv_crossroads WHERE id = ${req.params.id}`,
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Crossroads deleted" });
    }
  );
});

module.exports = router;
