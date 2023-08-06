# Node.js Service Log Reader with Prometheus Support

This Node.js program allows you to read a specific Linux service log and restart the service if certain conditions are met. It utilizes the `child_process` module to execute system commands, and it also integrates Prometheus for monitoring and alerting. Additionally, the program relies on an `.env` file for configuration.

## Requirements

- Node.js (v12 or higher)
- npm (Node Package Manager)
- Linux environment with systemd
- Prometheus (optional)

## Installation

1. Clone this repository to your local machine.
2. Navigate to the project directory and install dependencies:
   ```
   npm install
   ```
3. Prepare for you `.env` file
   ```
   PROM_PORT=9102
   MONITOR_SERVICE_NAME=your_service_name
   NUM_LOG_LINE=50
   LOG_THRESHOLDS=15
   PHRASE_TO_FIND="ERR"
   CHECK_INTERIVAL=60000
   ```
   Replace your_service_name with the name of the service you want to control and monitor. Set the PHRASE_TO_FIND to the phrase that you want to find in log file for the service. The PROM_PORT is the port where Prometheus will scrape metrics.

4. Start the program with 
    ```
    npm run start
    ```

## Features
- Read Service Log: The program will periodically read the specified service log file and look for a specific phrase related to a service error or problem.
- Restart Service: If the phrase is found in the log, the program will attempt to restart the service automatically.
- Prometheus Support: The program exposes Prometheus metrics on the specified port, allowing you to monitor the log occurrences and service restarts.

## Prometheus Metrics
The program exposes the following Prometheus metrics:

service_${serviceName}_error_counter: The number of occurrences of the specific phrase found in the service log.

process_${serviceName}_restart_total: The total number of times the service has been restarted by the program.

## Configuration
In the .env file, you can adjust the following variables:

- MONITOR_SERVICE_NAME: Replace with the name of your service (e.g., nginx, apache).
- PHRASE_TO_FIND: Set the phrase to finding in the log file of your service.
- PROM_PORT: Set the port where Prometheus will scrape metrics.
- NUM_LOG_LINE: Number of log lookup at once
- LOG_THRESHOLDS: How many times a the target phrase appeared to trigger restart 
- CHECK_INTERVIAL: Time intervial for look up log

## Monitoring
To monitor the metrics exposed by this program, you can configure Prometheus to scrape the metrics endpoint at http://your_server_ip:PROM_PORT/metrics.

## License
This project is licensed under the MIT License.

## Disclaimer
Use this program responsibly, and make sure you have proper access and permissions to control the service and access its logs. This program is provided as-is, and I am not responsible for any issues or damages caused by its usage. Please use it at your own risk.