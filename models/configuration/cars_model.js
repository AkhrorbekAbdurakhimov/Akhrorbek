const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  car_number: Joi.string().required(),
  note: Joi.string().required(),
  created_user_id: Joi.number().required(),
  watchlist_id: Joi.number().required(),
});

//  all request starts with /cars

router.get("/", (req, res) => {
  req.pgPool.query(
    `SELECT kc.id AS key, car_number, note, to_char(created_date, 'YYYY-MM-DD HH24:MI:SS') AS created_date, ku.full_name, watchlist_id, kw.name AS watchlist_name
    FROM 
        kv_cars kc JOIN kv_users ku ON created_user_id = ku.id JOIN kv_watchlist kw ON kc.watchlist_id = kw.id   
    WHERE kc.status`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, data: result.rows });
    }
  );
});

router.get("/:id", (req, res) => {
  req.pgPool.query(
    `SELECT id AS key, car_number, note, created_date, created_user_id, watchlist_id FROM kv_cars WHERE id = ${req.params.id} AND status`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      if (result.rowCount > 0)
        return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "Car not found" });
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
      kv_cars (car_number, note, created_user_id, watchlist_id)
    VALUES
      ($1, $2, $3, $4)`,
    [value.car_number, value.note, value.created_user_id, value.watchlist_id],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Car created" });
    }
  );
});

router.delete("/:id/:user_id", (req, res) => {
  const schema = Joi.object({
    id: Joi.number().required(),
    user_id: Joi.number().required(),
  });

  const { error, value } = schema.validate(req.params);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `UPDATE kv_cars SET deleted_date = NOW(), deleted_user_id = ${value.user_id}, status = false WHERE id = ${value.id}`,
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Car deleted" });
    }
  );
});

module.exports = router;
