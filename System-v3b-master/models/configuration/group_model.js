const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  name: Joi.string().required(),
  status: Joi.boolean().default(true),
});

//  all request starts with /group

router.get("/all", (req, res) => {
  req.pgPool.query(
    `SELECT 
      id AS key, title AS name, status 
    FROM 
      kv_groups
    ORDER BY 
      title ASC;`,
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
      id AS key, title AS name, status 
    FROM 
      kv_groups
    ORDER BY 
      title ASC
    LIMIT 
      ${value.limit}
    OFFSET
      ${value.offset};`,
    (err, result) => {
      if (err) {
        req.pgPool.end();
        return res.send({ status: 500, message: "Internal server error" });
      }
      req.pgPool.query(`SELECT COUNT(*) AS total FROM kv_groups;`, (err, r) => {
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

router.get("/:id", (req, res) => {
  req.pgPool.query(
    `SELECT 
        id AS key, title AS name, status 
    FROM 
        kv_groups
    WHERE 
        kv_groups.id = ${req.params.id}`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      if (result.rowCount > 0)
        return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "Group not found" });
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
        kv_groups (title, status)
    VALUES
      ($1, $2)`,
    [value.name, value.status],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Group created" });
    }
  );
});

router.put("/", (req, res) => {
  const schema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    status: Joi.boolean().default(true),
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
        kv_groups 
    SET 
        title = $1, status = $2 WHERE id = $3`,
    [value.name, value.status, value.id],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Group updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  req.pgPool.query(
    `DELETE FROM kv_groups WHERE id = ${req.params.id}`,
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Group deleted" });
    }
  );
});

module.exports = router;
