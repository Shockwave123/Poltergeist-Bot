const defineCommand = require('../general/define');

module.exports = {
  ...defineCommand,
  name: 'vocab',
  aliases: ['word'],
  description: 'Get an English dictionary definition and synonyms',
  usage: '.vocab <word>',
};
