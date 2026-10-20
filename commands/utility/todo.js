/**
 * Todo Command - Persistent personal todo list
 * Stored in the user database (database.js).
 * Usage: .todo add <task> | .todo list | .todo done <number> | .todo del <number> | .todo clear
 */

const { getUser, updateUser } = require('../../database');

module.exports = {
  name: 'todo',
  aliases: ['tasks', 'task'],
  category: 'utility',
  description: 'Manage your personal todo list (persisted)',
  usage: '.todo add <task> | .todo list | .todo done <n> | .todo del <n> | .todo clear',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const userId = extra.sender;

      const user = getUser(userId);
      user.todos = Array.isArray(user.todos) ? user.todos : [];

      const action = args.length > 0 ? args[0].toLowerCase() : 'list';

      if (action === 'add') {
        const task = args.slice(1).join(' ').trim();
        if (!task) {
          return await sock.sendMessage(chatId, {
            text: '❌ Usage: `.todo add <task>`'
          }, { quoted: msg });
        }
        user.todos.push({ task, done: false, createdAt: Date.now() });
        updateUser(userId, { todos: user.todos });
        return await sock.sendMessage(chatId, {
          text: `✅ Added to todos: *${task}*`
        }, { quoted: msg });
      }

      if (action === 'list') {
        if (user.todos.length === 0) {
          return await sock.sendMessage(chatId, {
            text: '📋 Your todo list is empty.\n\nAdd one with: `.todo add <task>`'
          }, { quoted: msg });
        }
        const lines = ['📋 *Your Todo List*', ''];
        user.todos.forEach((item, i) => {
          const status = item.done ? '✅' : '⏳';
          lines.push(`${status} ${i + 1}. ${item.task}`);
        });
        lines.push('', 'Mark done: `.todo done <n>`\nRemove: `.todo del <n>`\nClear all: `.todo clear`');
        return await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: msg });
      }

      if (action === 'done') {
        const n = parseInt(args[1], 10);
        if (!n || n < 1 || n > user.todos.length) {
          return await sock.sendMessage(chatId, {
            text: '❌ Invalid todo number.'
          }, { quoted: msg });
        }
        user.todos[n - 1].done = true;
        updateUser(userId, { todos: user.todos });
        return await sock.sendMessage(chatId, {
          text: `✅ Marked todo #${n} as done: *${user.todos[n - 1].task}*`
        }, { quoted: msg });
      }

      if (action === 'del' || action === 'delete' || action === 'remove') {
        const n = parseInt(args[1], 10);
        if (!n || n < 1 || n > user.todos.length) {
          return await sock.sendMessage(chatId, {
            text: '❌ Invalid todo number.'
          }, { quoted: msg });
        }
        const removed = user.todos.splice(n - 1, 1)[0];
        updateUser(userId, { todos: user.todos });
        return await sock.sendMessage(chatId, {
          text: `🗑️ Removed todo #${n}: *${removed.task}*`
        }, { quoted: msg });
      }

      if (action === 'clear') {
        user.todos = [];
        updateUser(userId, { todos: user.todos });
        return await sock.sendMessage(chatId, {
          text: '🗑️ All todos cleared.'
        }, { quoted: msg });
      }

      return await sock.sendMessage(chatId, {
        text: '❌ Unknown action.\n\nUsage: `.todo add <task>` | `.todo list` | `.todo done <n>` | `.todo del <n>` | `.todo clear`'
      }, { quoted: msg });

    } catch (error) {
      console.error('[todo] error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Todo operation failed: ' + (error.message || 'Unknown error')
      }, { quoted: msg });
    }
  }
};
