const express = require("express")
const { exec } = require('child_process');
const client = require('prom-client');
require('dotenv').config();

const app = express();

const serviceName = process.env.MONITOR_SERVICE_NAME ? process.env.MONITOR_SERVICE_NAME : 'ssh';          // Service Name. Default ssh.
const numLines = process.env.NUM_LOG_LINE ? process.env.NUM_LOG_LINE : 50;                                // Number of lines to read from the log 
const thresholds = process.env.NUM_LOG_LINE ? process.env.NUM_LOG_LINE : 15;
const phraseToFind = process.env.Phrase_To_Find ? process.env.Phrase_To_Find :'ERR';                                                                               //
const PromPort = process.env.PROM_PORT ? process.env.PROM_PORT : 9102;                                    // prometheus port. Default 9102.

const Registry = client.Registry;
const register = new Registry();

const serviceRestartCounter = new client.Counter({
    name: `process_${serviceName}_restart_total`,
    help: `process ${serviceName} restart counter`,
});

const serviceErrCounter = new client.Counter({
    name: `service_${serviceName}_error_counter`,
    help: `service ${serviceName} error counter`,
});

register.registerMetric(serviceRestartCounter);
register.registerMetric(serviceErrCounter);

register.setDefaultLabels({
    app: 'nodejs-readlog-restart-service'
});

function restartService(serviceName) {
    exec(`sudo systemctl restart ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error starting ${serviceName}: ${error.message}`);
            throw error;
        }
        serviceRestartCounter.inc();
        console.log(`${serviceName} restarted successfully.`);
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
            const countReturn = countServiceLog(serviceName, numLines, phraseToFind);
            if (countReturn > thresholds) {
                restartService(serviceName);
            }
        }
    } catch (e) {
        console.log(e);
    }
}

setInterval(function () { start(); }, 60000); // Run check every 60s


app.get('/metrics', async (request, response) => {
    response.setHeader('Content-type', register.contentType);
    response.end(await register.metrics());
})

app.listen(PromPort, () => {
    console.log('Started Prometheus server on port at', PromPort)
})