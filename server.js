require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = './uploads';
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image-preview';

function analyzeWeatherConditions(description) {
  const weatherMappings = {
    sunny: 'extreme heat waves with scorching sun, drought conditions, wilted vegetation',
    clear: 'extreme heat waves with scorching sun, drought conditions, wilted vegetation', 
    bright: 'extreme heat waves with scorching sun, drought conditions, wilted vegetation',
    rainy: 'severe flooding with water everywhere, heavy storms, submerged areas',
    cloudy: 'extreme storms with dark threatening clouds, heavy rain and flooding',
    snowy: 'complete ice age conditions with massive snowdrifts and frozen landscape',
    windy: 'devastating hurricane-force winds with debris flying, destroyed structures',
    foggy: 'thick toxic smog and pollution, apocalyptic atmosphere'
  };

  for (const [condition, effect] of Object.entries(weatherMappings)) {
    if (description.toLowerCase().includes(condition)) {
      return effect;
    }
  }
  
  return 'extreme climate change effects with rising sea levels and environmental devastation';
}

async function addTextOverlay(imageBuffer, title, originalHeight) {
  try {
    const image = sharp(imageBuffer);
    const { width, height } = await image.metadata();
    
    // Get average color from the bottom portion (generated image area)
    const bottomPortionBuffer = await sharp(imageBuffer)
      .extract({ left: 0, top: originalHeight, width: width, height: height - originalHeight })
      .toBuffer();
    const { dominant } = await sharp(bottomPortionBuffer).stats();
    const avgColor = `rgb(${Math.round(dominant.r)}, ${Math.round(dominant.g)}, ${Math.round(dominant.b)})`;
    
    // Calculate text size based on title length and image width - make title much larger
    const titleLength = title.length;
    const baseFontSize = Math.min(width / 8, 120); // Much larger base size
    const fontSizeAdjustment = titleLength > 30 ? 0.8 : titleLength > 20 ? 0.9 : 1.0; // Smaller font for longer titles
    const fontSize = Math.max(48, baseFontSize * fontSizeAdjustment);
    const padding = Math.max(25, width / 40);
    
    // Clean title - remove problematic characters for SVG
    const cleanTitle = title
      .replace(/&/g, 'and')
      .replace(/</g, '')
      .replace(/>/g, '')
      .replace(/"/g, '')
      .replace(/'/g, '');
    
    // Position title on top of generated image, not overlapping original
    const backgroundY = originalHeight;
    const titleY = originalHeight + fontSize + padding;
    
    // Create text SVG with background positioned between images
    const textSvg = `
      <svg width="${width}" height="${height}">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="black" flood-opacity="0.8"/>
          </filter>
        </defs>
        
        <!-- Background rectangle with image-based color between images -->
        <rect x="0" y="${backgroundY}" width="${width}" height="${fontSize + padding * 2}" 
              fill="${avgColor}" fill-opacity="0.4"/>
        
        <!-- Main title text between images -->
        <text x="${width / 2}" y="${titleY}" 
              font-family="Arial, sans-serif" 
              font-size="${fontSize}" 
              font-weight="bold" 
              text-anchor="middle" 
              fill="white" 
              filter="url(#shadow)">
          ${cleanTitle.toUpperCase()}
        </text>
      </svg>
    `;
    
    const result = await image
      .composite([{
        input: Buffer.from(textSvg),
        top: 0,
        left: 0
      }])
      .jpeg({ quality: 90 })
      .toBuffer();
    
    return result;
  } catch (error) {
    console.error('Error adding text overlay:', error);
    throw error;
  }
}

async function mergeImages(originalBuffer, generatedBase64, title = null) {
  try {
    // Convert base64 to buffer
    const generatedBuffer = Buffer.from(generatedBase64, 'base64');
    
    // Get image dimensions
    const originalMeta = await sharp(originalBuffer).metadata();
    const generatedMeta = await sharp(generatedBuffer).metadata();
    
    // Keep original dimensions and aspect ratios
    const originalWidth = originalMeta.width;
    const originalHeight = originalMeta.height;
    const generatedWidth = generatedMeta.width;
    const generatedHeight = generatedMeta.height;
    
    // Resize generated image to match original's width while maintaining aspect ratio
    const generatedAspectRatio = generatedWidth / generatedHeight;
    const resizedGeneratedHeight = Math.round(originalWidth / generatedAspectRatio);
    
    const resizedGenerated = await sharp(generatedBuffer)
      .resize({ width: originalWidth, height: resizedGeneratedHeight })
      .toBuffer();
    
    // Final dimensions: same width as original, combined heights
    const targetWidth = originalWidth;
    const targetHeight = originalHeight + resizedGeneratedHeight;
    
    // Create merged image vertically (original top, resized generated bottom)
    const mergedImage = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 3,
        background: { r: 0, g: 0, b: 0 }
      }
    })
    .composite([
      { input: originalBuffer, left: 0, top: 0 },
      { input: resizedGenerated, left: 0, top: originalHeight }
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
    
    // Add title overlay if provided
    if (title) {
      return await addTextOverlay(mergedImage, title, originalHeight);
    }
    return mergedImage;
  } catch (error) {
    console.error('Error merging images:', error);
    throw error;
  }
}

app.post('/analyze-and-generate', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const model = genAI.getGenerativeModel({ model: modelName });

    const imagePath = req.file.path;
    const imageData = fs.readFileSync(imagePath);
    const imageBase64 = imageData.toString('base64');
    
    // Keep original image buffer for merging later
    const originalImageBuffer = imageData;

    const generationPrompt = `TASK 1 - Transform this image to show the same location 20 years in the future, dramatically affected by climate change.

Keep the people recognizable with their EXACT original poses, but allow them to blend and adapt to the climate-transformed surroundings:
- Same faces and identical poses/body positions as the original photo
- Keep the exact same posture, arm positions, stance, and positioning
- People should look weathered, affected by the climate conditions (dust, heat, cold, etc.)
- Clothing can appear more worn, dirty, or weather-appropriate for the harsh conditions
- Facial expressions can show the reality of living in this climate-changed world
- Let environmental effects (dust, rain, heat distortion, shadows) naturally affect the people
- People should feel integrated into the apocalyptic environment while maintaining their exact original poses

Transform the ENVIRONMENT dramatically:
- Same composition but climate-devastated surroundings
- Show dramatic climate change impacts (extreme weather, rising seas, drought, storms, flooding, wildfires, pollution)
- Make the environment look apocalyptic and devastated
- Add realistic environmental damage and extreme weather effects
- The lighting, atmosphere, and environmental conditions should affect everything in the scene

Create a cohesive scene where the people belong in this climate-changed world while remaining recognizable.

TASK 2 - Create a SHORT, PROVOCATIVE viral title for this climate change comparison:
- Maximum 40 characters (VERY SHORT)
- Make it SHOCKING and provocative
- Use powerful, urgent words
- Examples: "Your Paradise Lost", "Still Going Here?", "Before Climate Hits", "This Changes Everything"
- Focus on loss, urgency, and personal impact
- Vary the structure - questions, statements, warnings
- Make people stop scrolling and share
- NO EMOJIS - powerful words only

Please provide your response as:
TITLE: [your catchy title here]
[generated image]`;

    const generatedResult = await model.generateContent([
      generationPrompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: req.file.mimetype
        }
      }
    ]);
    
    fs.unlinkSync(imagePath);

    // Extract title and image data from response
    const response = generatedResult.response;
    let generatedImageData = null;
    let socialMediaTitle = "Climate Change Impact";
    
    if (response.candidates && response.candidates[0] && response.candidates[0].content) {
      const content = response.candidates[0].content;
      
      if (content.parts) {
        for (const part of content.parts) {
          // Extract title from text parts
          if (part.text) {
            const titleMatch = part.text.match(/TITLE:\s*(.+)/i);
            if (titleMatch) {
              socialMediaTitle = titleMatch[1].trim();
            }
          }
          // Extract image data
          if (part.inlineData && part.inlineData.data) {
            generatedImageData = part.inlineData.data;
          }
        }
      }
    }

    if (!generatedImageData) {
      return res.status(500).json({ error: 'No image generated by the model' });
    }

    // Create merged image with title overlay
    const mergedImageBuffer = await mergeImages(originalImageBuffer, generatedImageData, socialMediaTitle);
    const mergedImageBase64 = mergedImageBuffer.toString('base64');

    res.json({
      generatedImageData: generatedImageData,
      mergedImageData: mergedImageBase64,
      socialMediaTitle: socialMediaTitle
    });

  } catch (error) {
    console.error('Error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process image: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`ClimaTime Machine server running on http://localhost:${PORT}`);
  console.log('Make sure to set GEMINI_API_KEY environment variable');
});