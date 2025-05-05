# Study Analytics for Obsidian

An Obsidian plugin that helps you manage your study sessions, track your habits, and analyze your productivity with a built-in Pomodoro timer.

## Features

- **Pomodoro Timer**: Built-in timer with customizable work and break intervals
- **Stopwatch Mode**: Track study time without predefined intervals
- **Recurring Sessions**: Set daily or weekly time goals for different categories of study
- **Session Tracking**: Record details about your study sessions including category, difficulty, and notes
- **Distraction Management**: Easily record and analyze what distracts you during study sessions
- **Line Notes**: Add contextual notes to specific lines in your notes while studying
- **Daily Summaries**: Generate comprehensive reports of your daily study activity
- **Weekly Summaries**: Get an overview of your entire week's study patterns and achievements
- **Modified Files Tracking**: Automatically track which files you modify during study sessions
- **Task Completion Tracking**: Record completed tasks during your sessions
- **Reflection System**: Add reflections during or after study sessions to improve your process
- **Compact Design**: Toggle a space-efficient interface ideal for smaller screens

### Screenshots *[from the minimal theme in obsidian]*
#### Sidebar from this plugin
![Screenshot 2025-05-05 125144](https://github.com/user-attachments/assets/37d896bc-a5fa-442c-b6ed-e3837c5fed60)
![Screenshot 2025-05-05 125153](https://github.com/user-attachments/assets/53d61713-b855-4ea4-92f3-afee7420154b)

#### Statistics in the daily summary
Here is an examples of a part of a note for the study session
![Screenshot 2025-05-05 130636](https://github.com/user-attachments/assets/683cba6d-2e16-44d7-9aff-13d1993f6dfa)

and here are the statistics around modifications and creations of files
![Screenshot 2025-05-05 130701](https://github.com/user-attachments/assets/52570486-f4f5-4bac-b3c2-61af28bbde26).

#### Statistics in the weekly summary (a selection of these)
![Screenshot 2025-05-05 130719](https://github.com/user-attachments/assets/e1457671-4fdd-4f90-bd09-9010f14c56a3)

The totally word count by the different days,
![Screenshot 2025-05-05 125500](https://github.com/user-attachments/assets/008202ba-b85f-406a-b5c8-2c69e29acd81)
the study time
![Screenshot 2025-05-05 125509](https://github.com/user-attachments/assets/6fca8abe-98bd-433a-bf83-89e72ff481a4)
and the number of created and modified files/notes:
![Screenshot 2025-05-05 125522](https://github.com/user-attachments/assets/58a89d77-cc28-4eca-97b6-444c8f66a32e).

## Versions
### What's New in 1.1.0

- **Consolidated Storage**: All session data is now stored in a single JSON file, improving performance and reliability
- **Recurring Sessions Improvements**: Fixed goal time tracking and interface updates for recurring session goals
- **Compact Design Mode**: New space-efficient interface option that reduces UI elements size while maintaining functionality
- **Button Label Optimization**: Streamlined button labels in compact mode for better space utilization

## Installation

1. In Obsidian, go to Settings > Community plugins
2. Disable Safe Mode
3. Click "Browse" and search for "Study Analytics"
4. Install the plugin and enable it

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

### Recurring Sessions
- Set daily or weekly time goals for different study categories
- Track your progress toward goals for each category
- Get visual indicators when goals are achieved
- Option to prorate weekly goals based on remaining days

### Daily & Weekly Summary
- Use the command palette and search for "Study Analytics: Create Daily Summary"
- Generate weekly summaries to track longer-term progress
- The plugin will generate markdown files with comprehensive summaries of your study activities

## Settings

You can customize various aspects of the plugin in the settings tab:

- **Timer Settings**: Customize Pomodoro intervals and break durations
- **Categories**: Add or remove study session categories
- **Tags**: Manage the tags available for line notes
- **Recurring Goals**: Set and manage time goals for different categories
- **Interface Options**: Toggle compact design for space efficiency
- **Other Settings**: Configure notes folder, auto-start options, and more

## Development

- Clone this repo to a local development folder
- Run `npm install` to install dependencies
- Run `npm run dev` to start compilation in watch mode

## License

MIT
