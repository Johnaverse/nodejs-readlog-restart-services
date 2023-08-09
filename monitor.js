const express = require("express")
const { exec } = require('child_process');
const client = require('prom-client');
const { error } = require("console");
require('dotenv').config();

const app = express();

const serviceName = process.env.MONITOR_SERVICE_NAME ? process.env.MONITOR_SERVICE_NAME : 'ssh';          // service name. Default ssh.
const numLines = process.env.NUM_LOG_LINE ? process.env.NUM_LOG_LINE : 50;                                // number of lines to read from the log 
const thresholds = process.env.LOG_THRESHOLDS ? process.env.LOG_THRESHOLDS : 15;                              // thresholds trigger restart
const phraseToFind_no_header = process.env.PHRASE_TO_FIND_NO_HEADER ? process.env.PHRASE_TO_FIND_NO_HEADER : 'No block headers to write in this log period block number';               // phrase for finding trigger log
const phraseToFind_no_body = process.env.PHRASE_TO_FIND_NO_BODY ? process.env.PHRASE_TO_FIND_NO_BODY : 'No block bodies to write in this log period block number';                     // phrase for finding trigger log
const promPort = process.env.PROM_PORT ? process.env.PROM_PORT : 9102;                                    // prometheus port. Default 9102.
const checkIntervial = process.env.CHECK_INTERVIAL ? process.env.CHECK_INTERVIAL : 60000;                  // check time intervial. Default 60s
const loglevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : "INFO";

const Registry = client.Registry;
const register = new Registry();

const serviceRestartCounter = new client.Counter({
    name: `process_${serviceName}_restart_total`,
    help: `process ${serviceName} restart counter`,
});

const erigonNoHeaderCounter = new client.Gauge({
    name: `service_${serviceName}_no_header_counter`,
    help: `service ${serviceName} no header counter`,
});

const erigonNoBodyCounter = new client.Gauge({
    name: `service_${serviceName}_no_body_counter`,
    help: `service ${serviceName} no body counter`,
});

register.registerMetric(serviceRestartCounter);
register.registerMetric(erigonNoHeaderCounter);
register.registerMetric(erigonNoBodyCounter);

function restartService(serviceName) {
    return new Promise((resolve, rejects) => {
        exec(`systemctl restart ${serviceName}`, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error starting ${serviceName}: ${error.message}`);
                rejects(error);
            }
            serviceRestartCounter.inc();
            var _counter = await register.getSingleMetricAsString(`process_${serviceName}_restart_total`);
            console.log(`${serviceName} restarted successfully. Restart Counter: ${_counter}`);
            resolve();
        });
    });
}

function checkServiceStatus(serviceName) {
    return new Promise((resolve, rejects) => {
        exec(`systemctl is-active ${serviceName}`, (error, stdout, stderr) => {
            if (error) {
                if (loglevel == "DEBUG") {
                    console.error(`Error checking status of ${serviceName}: ${error.message}`);
                }
                resolve(false);
            }
            const isActive = stdout.trim() === 'active';
            resolve(isActive ? true : false);
        });
    });
}

function readServiceLog(serviceName, lines = 50) {
    return new Promise((resolve, rejects) => {
        exec(`journalctl -u ${serviceName} -n ${lines}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error reading ${serviceName} log: ${error.message}`);
                rejects(error);
            }

            if (loglevel == "DEBUG") {
                console.log(`Last ${lines} lines of ${serviceName} log:`);
                console.log(stdout);
            }

            resolve(stdout);
        });
    });
}

function countServiceLog(serviceName, numLines, phrase) {
    return new Promise((resolve, rejects) => {
        checkServiceStatus(serviceName).then((active) => {
            if (active) {
                readServiceLog(serviceName, numLines)
                    .then((stdout) => {
                        const logsArray = stdout.split('\n');
                        const count = logsArray.filter((log) => log.includes(phrase)).length;
                        if (loglevel == "DEBUG") {
                            console.log(`Last ${serviceName} ${numLines} logs: included ${count} logs with phrase ${phrase}`);
                        }
                        resolve(count);
                    })
                    .catch((error) => { rejects(error) });
            }
        })
            .catch((error) => { rejects(error) });
    });
}

function start() {
    checkServiceStatus(serviceName)
        .then(async (active) => {
            if (active) {
                const countReturn_noheader = await countServiceLog(serviceName, numLines, phraseToFind_no_header);
                const countReturn_nobody = await countServiceLog(serviceName, numLines, phraseToFind_no_body);
                erigonNoHeaderCounter.set(countReturn_noheader);
                erigonNoBodyCounter.set(countReturn_nobody);

                if (countReturn_noheader > thresholds || countReturn_nobody > thresholds) {
                    console.log(`Last ${serviceName} ${numLines} logs over ${thresholds} logs with phrase ${phraseToFind_no_header} or ${phraseToFind_no_body}. Restarting service ...`);
                    restartService(serviceName).then(() => {
                        console.log(`Restart successfully.`)
                    })
                        .catch((e) => {
                            console.log(e);
                        })
                }
                if (loglevel == "DEBUG") {
                    console.log(`No header occurred times: ${countReturn_noheader} `);
                    console.log(`No body occurred times: ${countReturn_nobody} `);
                }
            }
            else {
                console.error(`Error checking status of ${serviceName}: non-active state`);
            }
        })
        .catch((e) => {
            console.log(e);
        })
}

setInterval(function () { start(); }, checkIntervial);

app.get('/metrics', async (request, response) => {
    response.setHeader('Content-type', register.contentType);
    response.end(await register.metrics());
})

app.listen(promPort, () => {
    console.log('Started Prometheus server on port at', promPort);
})
