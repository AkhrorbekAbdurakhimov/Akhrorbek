const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");
const { probeIp, isPortReachable } = require("../../services/ping");
const { cpuUsage, memUsage } = require("../../services/cpu_mem_usage");

//  all request starts with /maintenance/diagnosis

router.get("/ping", (req, res) => {
  const schema = Joi.object({
    ip_address: Joi.string()
      .ip({
        version: ["ipv4"],
      })
      .required(),
  });

  const { error, value } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  probeIp(value.ip_address, (isAlive) => {
    res.send({ status: 200, isAlive, ip_address: value.ip_address });
  });
});

router.get("/cpu", (req, res) => {
  cpuUsage((percentageCPU) => {
    res.send({ status: 200, percentageCPU });
  });
});

router.get("/mem", (req, res) => {
  memUsage((data) => {
    res.send({ status: 200, data: data });
  });
});

router.get("/check_connection", (req, res) => {
  const schema = Joi.object({
    ip_address: Joi.string()
      .ip({
        version: ["ipv4"],
      })
      .required(),
    port: Joi.number().port().required(),
  });
  const { error, value } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });
  isPortReachable(value.ip_address, value.port, (isReachable) => {
    res.send({ status: 200, isReachable });
  });
});

module.exports = router;
