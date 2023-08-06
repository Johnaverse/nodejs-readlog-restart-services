const express = require("express")
const { exec } = require('child_process');
const client = require('prom-client');
require('dotenv').config();

const app = express();

const serviceName = process.env.MONITOR_SERVICE_NAME ? process.env.MONITOR_SERVICE_NAME : 'ssh';          // service name. Default ssh.
const numLines = process.env.NUM_LOG_LINE ? process.env.NUM_LOG_LINE : 50;                                // number of lines to read from the log 
const thresholds = process.env.NUM_LOG_LINE ? process.env.NUM_LOG_LINE : 15;                              // thresholds trigger restart
const phraseToFind_no_header = process.env.PHRASE_TO_FIND_NO_HEADER ? process.env.PHRASE_TO_FIND_NO_HEADER : 'No block headers to write in this log period block number';               // phrase for finding trigger log
const phraseToFind_no_body = process.env.PHRASE_TO_FIND_NO_BODY ? process.env.PHRASE_TO_FIND_NO_BODY : 'No block bodies to write in this log period block number';                     // phrase for finding trigger log
const promPort = process.env.PROM_PORT ? process.env.PROM_PORT : 9102;                                    // prometheus port. Default 9102.
const checkIntervial = process.env.CHECK_INTERVIAL ? process.env.CHECK_INTERVIAL : 60000;                  // check time intervial. Default 60s
const loglevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : INFO;

const Registry = client.Registry;
const register = new Registry();

const serviceRestartCounter = new client.Counter({
    name: `process_${serviceName}_restart_total`,
    help: `process ${serviceName} restart counter`,
});

const erigonNoHeaderCounter = new client.Counter({
    name: `service_${serviceName}_no_header_counter`,
    help: `service ${serviceName} no header counter`,
});

const erigonNoBodyCounter = new client.Counter({
    name: `service_${serviceName}_no_body_counter`,
    help: `service ${serviceName} no body counter`,
});

register.registerMetric(serviceRestartCounter);
register.registerMetric(erigonNoHeaderCounter);
register.registerMetric(erigonNoBodyCounter);

register.setDefaultLabels({
    app: 'nodejs-readlog-restart-service'
});

function restartService(serviceName) {
    exec(`sudo systemctl restart ${serviceName}`, async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error starting ${serviceName}: ${error.message}`);
            throw error;
        }
        serviceRestartCounter.inc();
        var _counter = await register.getSingleMetricAsString(`process_${serviceName}_restart_total`)
        console.log(`${serviceName} restarted successfully. Restart Counter: ${_counter}`);
    });
}

function checkServiceStatus(serviceName) {
    exec(`systemctl is-active ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error checking status of ${serviceName}: ${error.message}`);
            throw error;
        }
        const isActive = stdout.trim() === 'active';
        return isActive ? true : false;
    });
}

function readServiceLog(serviceName, lines = 50) {
    exec(`journalctl -u ${serviceName} -n ${lines}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error reading ${serviceName} log: ${error.message}`);
            throw error;
        }

        if (loglevel === "DEBUG") {
            console.log(`Last ${lines} lines of ${serviceName} log:`);
            console.log(stdout);
        }

        return (stdout);
    });
}

function countServiceLog(serviceName, numLines, phrase) {
    try {
        if (checkServiceStatus(serviceName)) {
            readServiceLog(serviceName, numLines).then((stdout) => {
                const logsArray = stdout.split('\n');
                const count = logsArray.filter((log) => log.includes(phrase)).length;
                return count;
            })
        }
    } catch (e) {
        console.log(e);
    }

}

function start() {
    try {
        if (checkServiceStatus(serviceName)) {
            const countReturn_noheader = countServiceLog(serviceName, numLines, phraseToFind_no_header);
            const countReturn_nobody = countServiceLog(serviceName, numLines, phraseToFind_no_body);
            erigonNoHeaderCounter.set(countReturn_noheader)
            erigonNoBodyCounter.set(countReturn_nobody)
            if (loglevel === "DEBUG") {
                console.log({ "countReturn_noheader": countReturn_noheader, "erigonNoBodyCounter": erigonNoBodyCounter })
            }
            if (countReturn_noheader > thresholds || countReturn_nobody > thresholds) {
                restartService(serviceName);
            }
        }
    } catch (e) {
        console.log(e);
    }
}

setInterval(function () { start(); }, checkIntervial);

app.get('/metrics', async (request, response) => {
    response.setHeader('Content-type', register.contentType);
    response.end(await register.metrics());
})

app.listen(PromPort, () => {
    console.log('Started Prometheus server on port at', promPort)
})
