const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
  full_name: Joi.string().required(),
  group_id: Joi.number().required(),
  description: Joi.string(),
});

//  all request starts with /users

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
      u.id AS key, username, full_name, description, u.status, to_char(last_seen, 'YYYY-MM-DD HH24:MI:SS') AS last_seen, group_id, g.title AS g_name 
    FROM 
      kv_users u
    JOIN 
      kv_groups g ON u.group_id = g.id
    ORDER BY
      u.id ASC
    LIMIT 
      ${value.limit}
    OFFSET
      ${value.offset};`,
    (err, result) => {
      if (err) {
        req.pgPool.end();
        return res.send({ status: 500, message: "Internal server error" });
      }
      req.pgPool.query(`SELECT COUNT(*) AS total FROM kv_users;`, (err, r) => {
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
      u.id AS key, username, full_name, description, u.status, to_char(last_seen, 'YYYY-MM-DD HH24:MI:SS') AS last_seen, group_id, g.title AS g_name 
    FROM 
      kv_users u
    JOIN 
      kv_groups g ON u.group_id = g.id
    WHERE id = ${req.params.id}`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      if (result.rowCount > 0)
        return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "User not found" });
    }
  );
});

router.post("/", (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (value.description == undefined) value.description = null;
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `INSERT INTO 
      kv_users (username, password, full_name, description, group_id)
    VALUES
      ($1, $2, $3, $4, $5)`,
    [
      value.username,
      value.password,
      value.full_name,
      value.description,
      value.group_id,
    ],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "User created" });
    }
  );
});

router.put("/", (req, res) => {
  const putSchema = Joi.object({
    user_id: Joi.number().required(),
    group_id: Joi.number().required(),
    status: Joi.boolean().required(),
    username: Joi.string().required(),
    full_name: Joi.string().required(),
    description: Joi.string(),
  });

  const { error, value } = putSchema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  if (value.description == undefined) value.description = null;

  req.pgPool.query(
    `UPDATE 
      kv_users 
    SET
      username = $1, full_name = $2, description = $3, status = $4, group_id = $5
    WHERE 
      id = $6`,
    [
      value.username,
      value.full_name,
      value.description,
      value.status,
      value.group_id,
      value.user_id,
    ],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "User updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  if (req.params.id == 1)
    return res.send({ status: 405, message: "Not allowed to delete Admin" });
  req.pgPool.query(
    `DELETE FROM kv_users WHERE id = ${req.params.id}`,
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "User deleted" });
    }
  );
});

module.exports = router;
