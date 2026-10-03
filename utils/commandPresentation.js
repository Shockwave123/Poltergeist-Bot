const FOLDER_ORDER = ['general', 'ai', 'anime', 'media', 'fun', 'economy', 'utility', 'textmaker', 'admin', 'owner'];

const FOLDER_DETAILS = {
  general: { label: 'GENERAL', icon: '🧭' },
  ai: { label: 'AI', icon: '🤖' },
  anime: { label: 'ANIME', icon: '👾' },
  media: { label: 'MEDIA', icon: '🎞️' },
  fun: { label: 'FUN', icon: '🎭' },
  economy: { label: 'ECONOMY', icon: '💰' },
  utility: { label: 'UTILITY', icon: '🔧' },
  textmaker: { label: 'TEXTMAKER', icon: '🖋️' },
  admin: { label: 'ADMIN', icon: '🛡️' },
  owner: { label: 'OWNER', icon: '👑' }
};

function getUniqueCommands(commands) {
  const unique = new Map();
  const values = commands instanceof Map ? commands.values() : commands;
  for (const command of values || []) {
    if (command?.name) unique.set(command.name, command);
  }
  return [...unique.values()];
}

function getFolderDetails(folder) {
  const key = String(folder || 'other').toLowerCase();
  return FOLDER_DETAILS[key] || { label: key.toUpperCase(), icon: '📂' };
}

function groupCommands(commands) {
  const groups = new Map();
  getUniqueCommands(commands).forEach((command) => {
    const folder = String(command.folder || command.category || 'other').toLowerCase();
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(command);
  });

  return [...groups.entries()]
    .sort(([first], [second]) => {
      const firstIndex = FOLDER_ORDER.indexOf(first);
      const secondIndex = FOLDER_ORDER.indexOf(second);
      const firstOrder = firstIndex < 0 ? FOLDER_ORDER.length : firstIndex;
      const secondOrder = secondIndex < 0 ? FOLDER_ORDER.length : secondIndex;
      return firstOrder - secondOrder || first.localeCompare(second);
    })
    .map(([folder, folderCommands]) => ({
      folder,
      ...getFolderDetails(folder),
      commands: folderCommands.sort((first, second) => first.name.localeCompare(second.name))
    }));
}

module.exports = { getUniqueCommands, getFolderDetails, groupCommands };