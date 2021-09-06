const express = require("express");
const router = express.Router();
const fs = require("fs");
const Joi = require("@hapi/joi");
const compareVersions = require("compare-versions");
const path = require("path");

//  all request starts with /updates

router.get("/downloadUpdate", (req, res) => {
  const schema = Joi.object({
    filename: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  if (fs.existsSync(`./updates/${value.filename}`)) {
    return res.download(`./updates/${value.filename}`);
  } else {
    return res.sendStatus(404);
  }
});

router.post("/checkForUpdate", (req, res) => {
  const schema = Joi.object({
    appName: Joi.string().required(),
    version: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  fs.readdir(`./updates/`, (err, files) => {
    if (err || files.length <= 0)
      return res.send({ status: 404, message: "No updates", err });
    let sentResponse = false;
    const zipFiles = files.filter((el) => /\.zip$/.test(el));
    zipFiles.forEach((file, index) => {
      const newVertion = path.basename(file, ".zip").split("_")[1];
      const shoulDownload = compareVersions(newVertion, value.version);
      if (
        file.includes(value.appName) &&
        shoulDownload === 1 &&
        !sentResponse
      ) {
        sentResponse = true;
        return res.send({
          status: 200,
          filename: `${value.appName}_${newVertion}.zip`,
        });
      } else {
        if (zipFiles.length - 1 === index && !sentResponse) {
          return res.send({
            status: 404,
            message: `No updates for ${value.appName}`,
          });
        }
      }
    });
  });
});

module.exports = router;
