const { query } = require("express");
const { Pool } = require("pg");
const CONFIG = require("../config");

const queries = [
  "REFRESH MATERIALIZED VIEW kv_stat_count_mview WITH DATA;",
  "REFRESH MATERIALIZED VIEW kv_stat_crossroad_overload_mview WITH DATA;",
  "REFRESH MATERIALIZED VIEW kv_stat_crossroads_mview WITH DATA;",
  "REFRESH MATERIALIZED VIEW kv_stat_rules_mview WITH DATA;",
  "REFRESH MATERIALIZED VIEW kv_stat_top_cars_mview WITH DATA;",
];

let taskEnded = false;

const initRefresh = () => {
  console.info("Started: ", new Date(Date.now() + 1000 * 60 * -new Date().getTimezoneOffset()).toISOString().replace("T", " ").replace("Z", ""));
  refresh();
  setInterval(() => {
    if (taskEnded) {
      taskEnded = false;
      refresh();
    }
  }, 30000);
};

const refresh = async () => {
  const pools = [];
  for (let index = 0; index < queries.length; index++) {
    try {
      console.time(`Pool[${index}]`);
      pools[index] = new Pool(CONFIG.DB);
      await pools[index].query(query);
    } catch (error) {
      console.error(index, err.message);
    } finally {
      if (pools[index]) pools[index].end();
      pools[index] = null;
      console.timeEnd(`Pool[${index}]`);
      if (index === queries.length - 1) taskEnded = true;
    }
  }
};

module.exports = { initRefresh };
