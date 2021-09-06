const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");
const { Pool } = require("pg");
const { DB } = require("../../config/index");

const fs = require("fs");
const http = require("http");
const CONFIG = require("../../config/index");

const schema = Joi.object({
  fn: Joi.string().required(),
  query: Joi.object(),
});

//  all request starts with /stat

router.post("/", (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  const pool = new Pool(DB);
  const { from_date, to_date, hasParams } = value.query;

  const query = hasParams
    ? `SELECT * FROM ${value.fn}('${from_date}', '${to_date}');`
    : `SELECT * FROM ${value.fn}();`;

  pool.query(query, (error, results) => {
    if (error) {
      pool.end();
      return res.send({
        status: 500,
        message: "Internal server occured",
        error: error,
      });
    }

    if (value.fn === "kv_stat_top_cars") {
      results.rows.forEach((car, index, orgArray) => {
        getCarDetails({ car_number: car.car_number }, (cd) => {
          orgArray[index].car = cd;
          if (orgArray.length - 1 === index) {
            return res.send({ status: 200, results: results.rows });
          }
        });
      });
    } else {
      return res.send({ status: 200, results: results.rows });
    }
  });
});

router.get("/", (req, res) => {
  const pool = new Pool(DB);
  pool.query(
    `SELECT 
      * 
    FROM 
      kv_stat 
    WHERE 
        status;`,
    (error, results) => {
      pool.end();
      if (error)
        return res.send({
          status: 500,
          message: "Internal server occured",
          error: error,
        });

      return res.send({ status: 200, results: results.rows });
    }
  );
});

module.exports = router;

const getCarDetails = (carData, cb) => {
  const schema = Joi.object({
    car_number: Joi.string().required(),
    token: Joi.string(),
  });

  const { error, value } = schema.validate(carData);
  if (error) {
    cb(null);
  }

  try {
    value.token = JSON.parse(fs.readFileSync("./files/token.txt", "utf-8"));
  } catch (error) {
    cb(null);
  }

  const data = JSON.stringify({
    pPlateNumber: value.car_number.toUpperCase(),
  });

  const options = {
    hostname: CONFIG.API_URL,
    port: CONFIG.API_PORT,
    path: "/Violations/api/GetVehicleFull",
    method: "POST",
    headers: {
      Authorization: `Bearer ${value.token.access_token}`,
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };

  const request = http.request(options, (res) => {
    if (res.statusCode === 200) {
      res.on("data", (d) => {
        let data = JSON.parse(d.toString("utf-8"));
        if (data.pAnswereCode == 1 && data.pComment == "OK") {
          const { pModel, pColor } = data.Vehicle;
          const car = { model: pModel, color: pColor };
          cb(car);
        } else {
          cb(null);
        }
      });
    }
  });

  request.on("error", (error) => {
    console.error(error);
    cb(null);
  });

  request.write(data);
  request.end();
};
