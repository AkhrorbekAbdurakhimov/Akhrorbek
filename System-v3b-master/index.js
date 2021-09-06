const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");

const login = require("./models/index");
const rf = require("./models/rf/index");
const kvlite = require("./models/kvlite/index");
const statistics = require("./models/statistics/index");
const image = require("./models/image/index");
const feed = require("./models/feedback/index");

/* Services start */
require("./services/token")();
require("./services/ping").init();
require("./services/cpu_mem_usage");
require("./services/kvliteConfig/index")();
// require("./services/refreshView").initRefresh();
const Session = require("./services/clean_sessions");
const update = require("./services/updates/index");
/* Services end */

/* Viedo util */
const cleanVideos = require("./models/kvlite/util/cleanVideo");

/* Configuration requests start */

const cameras = require("./models/configuration/cameras_model");
const cctv = require("./models/configuration/cctv_model");
const computers = require("./models/configuration/computers_model");
const group = require("./models/configuration/group_model");
const cross = require("./models/configuration/crossroads_model");
const users = require("./models/configuration/users_model");
const rules = require("./models/configuration/rules_model");
const kvliteConfig = require("./models/configuration/kv_lite");
const systemConfig = require("./models/configuration/kv_system_config");

/* Configuration requests end */

/* Maintenance requests start */
const diagnosis = require("./models/maintenance/diagnosis");
const health = require("./models/maintenance/health");
const services = require("./models/maintenance/services");
/* Maintenance requests end */

const auth = require("./middlewares/auth");
const CONFIG = require("./config/index");

const corsOptions = {
  exposedHeaders: "token",
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.use("/login", login);
app.use("/rf", auth, rf);
app.use("/kvlite", auth, kvlite);
app.use("/stat", statistics);
app.use("/image", image);
app.use("/feed", auth, feed);

/* Configuration requests */
app.use("/conf/cameras", auth, cameras);
app.use("/conf/cctv", auth, cctv);
app.use("/conf/computers", auth, computers);
app.use("/conf/group", auth, group);
app.use("/conf/cross", auth, cross);
app.use("/conf/users", auth, users);
app.use("/conf/rules", auth, rules);
app.use("/conf/kvlite", auth, kvliteConfig);
app.use("/conf/system", auth, systemConfig);
/* Configuration requests */

/* Maintenance requests*/
app.use("/maintenance/diagnosis", auth, diagnosis);
app.use("/maintenance/services", services);
app.use("/maintenance/health", health);

/* Maintenance requests*/

/* Update Service */
app.use("/updates", update);
/* Update Service */

app.use((req, res) => {
  res.send({ status: 404, message: "Not found" });
});

setInterval(() => {
  const cv = new cleanVideos();
  cv.unlinkVideos();
}, parseInt(CONFIG.UPDATE_TOKEN_INTERVAL * 1000)); // 23 hours

setInterval(() => {
  Session.clean();
}, 300000); // 5 minutes

app.listen(CONFIG.SYSTEM.PORT, "0.0.0.0", () => console.log(`${CONFIG.ENV} server started on port: ${CONFIG.SYSTEM.PORT}`));
