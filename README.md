# Climatime Machine 🌍

A web app that analyzes your vacation photos and generates a vision of the same location 20 years in the future, dramatically affected by climate change.

## Features

- Upload vacation photos via drag-and-drop or file picker
- AI-powered weather condition analysis using Gemini 2.5 Flash
- Intelligent climate change scenario mapping:
  - Sunny → Extreme heat waves and drought
  - Rainy → Severe flooding and storms
  - Snowy → Ice age conditions
  - Windy → Hurricane-force destruction
  - And more...
- Realistic future photo generation prompts

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Get a Gemini API key:**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key for Gemini 2.5 Flash

3. **Set environment variable:**
   ```bash
   export GEMINI_API_KEY="your-api-key-here"
   ```
   Or create a `.env` file:
   ```
   GEMINI_API_KEY=your-api-key-here
   ```

4. **Run the app:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

5. **Open in browser:**
   ```
   http://localhost:3000
   ```

## How it Works

1. **Upload**: Drag and drop or select a vacation photo
2. **Analysis**: Gemini 2.5 Flash analyzes the weather conditions and scene
3. **Mapping**: The app maps current conditions to extreme climate change scenarios
4. **Generation**: Creates a detailed prompt for the climate-changed version

## Note on Image Generation

Currently, Gemini 2.5 Flash returns text descriptions rather than actual images. For production use, you would integrate with:
- DALL-E API
- Midjourney API  
- Stable Diffusion
- Other image generation services

## Tech Stack

- **Backend**: Express.js, Multer (file uploads)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **AI**: Google Gemini 2.5 Flash for image analysis
- **Styling**: Modern glassmorphism UI with gradients

## Climate Scenarios

The app maps weather conditions to these climate change effects:

| Original | Future (2044) |
|----------|---------------|
| Sunny/Clear | Extreme heat waves, drought, wilted vegetation |
| Rainy | Severe flooding, submerged areas |
| Cloudy | Extreme storms, heavy rain |
| Snowy | Complete ice age conditions |
| Windy | Hurricane-force winds, destruction |
| Foggy | Toxic smog, pollution |

## File Structure

```
climatime-machine/
├── server.js          # Express.js backend
├── package.json       # Dependencies
├── public/
│   └── index.html     # Frontend interface
├── uploads/           # Temporary photo storage (auto-created)
└── README.md         # This file
```