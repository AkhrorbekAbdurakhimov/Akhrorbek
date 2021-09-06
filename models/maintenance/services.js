const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const CONFIG = require("../../config/index");
const Joi = require("@hapi/joi");
const child = require("child_process");
const { stdout } = require("process");

const postSchema = Joi.object({
  id: Joi.number().required(),
  action: Joi.string().valid("stop", "start", "restart"),
});

//All requests with /maintenance/services
var services = [
  { id: 1, title: "System", name: "system", status: false },
  { id: 2, title: "Trafcon", name: "trafconagt", status: false },
  { id: 3, title: "autoconsync", name: "autoconsync", status: false },
  { id: 4, title: "База данных", name: "postgresql-11", status: false },
  { id: 5, title: "База данных", name: "postgresql-12", status: false },
];

router.get("/", async (req, res) => {
  var state;
  var list = [
    { id: 1, title: "System", name: "system", status: false },
    { id: 2, title: "Trafcon", name: "trafconagt", status: false },
    { id: 3, title: "autoconsync", name: "autoconsync", status: false },
    { id: 4, title: "База данных", name: "postgresql-11", status: false },
    { id: 5, title: "База данных", name: "postgresql-12", status: false },
  ];

  for (let i = 0; i < list.length; i++) {
    await new Promise(async (resolve, reject) => {
      await child.exec(`systemctl status ${list[i].name}`, (error, stdout, stderr) => {
        if (error) {
          switch (error.code) {
            case 1:
              state = { status: false, message: "failed" };
              break;
            case 2:
              state = { status: false, message: "unused" };
              break;
            case 3:
              state = { status: false, message: "inactive" };
              break;
            case 4:
              state = { status: false, message: "No such unit" };
              break;
            default:
              state = { status: false, message: "unexpected error occured" };
          }
        } else {
          if (stdout.includes("active")) state = { status: true, message: "Working" };
        }

        list[i] = { ...list[i], ...state };
        resolve();
      });
    });
  }
  let tmp = list[3].message === "No such unit" ? list[4] : list[3];
  list[3] = { ...list[4], ...tmp };
  list.pop();

  return res.send({ status: 200, data: list });
});

router.post("/", (req, res) => {
  const { error, value } = postSchema.validate(req.body);
  if (error) return res.send({ status: 400, message: "Bad request" });
  let service = services.filter((item) => item.id === value.id);
  if (service.length > 0) {
    service = service[0];
    child.exec(`systemctl ${value.action} ${service.name}`, (error, stdout, stderr) => {
      if (error || stderr) return res.send({ status: 500, message: "Internal server error" });
      console.log(stdout);
      return res.send({ status: 200, message: "Command successfully executed" });
    });
  } else return res.send({ status: 400, message: "No such id found" });
});

router.post("/logs/:id", (req, res) => {
  if (!req.params.id) return res.send({ status: 400, message: "bad request" });
  let service = services.filter((item) => item.id == req.params.id);
  if (service.length > 0) {
    service = service[0];
    child.exec(`systemctl status ${service.name}`, (error, stdout, stderr) => {
      // if (error || stderr) return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, logs: stdout || stderr });
    });
  } else return res.send({ status: 400, message: "No such id found" });
});

module.exports = router;
