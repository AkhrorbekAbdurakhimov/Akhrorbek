const http = require("http");
const querystring = require("querystring");
const fs = require("fs");

const CONFIG = require("../config/index");

const data = querystring.stringify({
  username: CONFIG.API_USERNAME,
  password: CONFIG.API_PASSWORD,
  grant_type: CONFIG.API_GRANT_TYPE,
});

const options = {
  hostname: CONFIG.API_URL,
  port: CONFIG.API_PORT,
  path: "/Violations/token",
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": data.length,
  },
};

module.exports = initToken = () => {
  getToken();
  setInterval(() => {
    getToken();
  }, parseInt(CONFIG.UPDATE_TOKEN_INTERVAL * 1000));
};

const getToken = () => {
  const req = http.request(options, (res) => {
    let date = new Date();
    console.log(
      "\x1b[36m",
      `TOKEN UPDATE SET TO: ${
        CONFIG.UPDATE_TOKEN_INTERVAL / 3600
      } hours FROM ${date.getFullYear()}/${
        date.getMonth() + 1
      }/${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
    );

    if (res.statusCode === 200) {
      res.on("data", (d) => {
        fs.writeFileSync("./files/token.txt", d);
      });
    }
  });

  req.on("error", (error) => {
    console.error(error);
  });

  req.write(data);
  req.end();
};
