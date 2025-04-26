# Study Analytics for Obsidian

An Obsidian plugin that helps you manage your study sessions, track your habits, and analyze your productivity with a built-in Pomodoro timer.

## Features

- **Pomodoro Timer**: Built-in timer with customizable work and break intervals
- **Stopwatch Mode**: Track study time without predefined intervals
- **Session Tracking**: Record details about your study sessions including category, difficulty, and notes
- **Distraction Management**: Easily record and analyze what distracts you during study sessions
- **Line Notes**: Add contextual notes to specific lines in your notes while studying
- **Daily Summaries**: Generate comprehensive reports of your daily study activity
- **Modified Files Tracking**: Automatically track which files you modify during study sessions
- **Task Completion Tracking**: Record completed tasks during your sessions
- **Reflection System**: Add reflections during or after study sessions to improve your process

## Installation

1. In Obsidian, go to Settings > Community plugins
2. Disable Safe Mode
3. Click "Browse" and search for "Study Analytics"
4. Install the plugin and enable it

## Manual Installation

1. Download the latest release from the Releases section
2. Extract the zip file to your Obsidian plugins folder: `{vault}/.obsidian/plugins/`
3. Reload Obsidian
4. Enable the plugin in Settings > Community plugins

## Usage

### Getting Started
1. After installation, the Study Flow sidebar will automatically open on the right side
2. If it doesn't open, use the command palette and search for "Study Analytics: Show Study Flow"

### Timer Controls
- **Start/Pause**: Begin or pause the current timer
- **New Session**: Start a new study session with a different category while keeping timer running
- **End**: End the current session and save it

### Session Management
- Select a category for your study session (Study, Work, Reading, etc.)
- Rate the difficulty of your session (1-5)
- Add detailed notes during your session
- Record distractions as they occur to help identify patterns
- Add reflections to capture insights about your study process

### Daily Summary
- Use the command palette and search for "Study Analytics: Create Daily Summary"
- The plugin will generate a markdown file with a comprehensive summary of your day's study sessions

## Settings

You can customize various aspects of the plugin in the settings tab:

- **Timer Settings**: Customize Pomodoro intervals and break durations
- **Categories**: Add or remove study session categories
- **Tags**: Manage the tags available for line notes
- **Other Settings**: Configure notes folder, auto-start options, and more

## Development

- Clone this repo to a local development folder
- Run `npm install` to install dependencies
- Run `npm run dev` to start compilation in watch mode

## License

MIT