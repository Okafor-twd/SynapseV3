"use strict";

const SynzApi = require("./SynzApi.js");
const Console = require("./Console.js");

module.exports = {
    ...SynzApi,
    Console,
    SynapseConsole: Console.SynapseConsole,
};
