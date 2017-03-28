const Client = require('./Client');

const cli = new Client();
process.exit(cli.main(process.argv));