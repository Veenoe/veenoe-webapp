# Viva Examination System - Frontend

Modern, production-ready frontend for the AI-powered viva examination system built with Next.js 15, React 19, Tailwind CSS v4, and shadcn/ui.

## 🚀 Features

- ✅ **Real-time Voice Interaction** - Natural conversations with AI examiner via Gemini Live API
- ✅ **Advanced AI Reasoning** - Thinking capabilities for better question evaluation
- ✅ **10-Minute Sessions** - Time-bound examinations with visual countdown
- ✅ **Voice Selection** - Choose from multiple AI voices (Kore, Puck, Charon, Aoede, Fenrir)
- ✅ **Adaptive Questioning** - AI adjusts difficulty based on performance
- ✅ **Real-time Transcription** - See the conversation as it happens

## 🛠️ Tech Stack

- **Next.js 16.0.1** - React framework with App Router
- **React 19.2.0** - Latest with Server Components
- **TypeScript 5** - Type safety
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - High-quality component library
- **Zustand** - State management
- **Gemini Live API** - Real-time audio streaming

## 📦 Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

## 🔧 Environment Variables

Create a `.env.local` file:

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 🏃 Running the App

```bash
# Development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The app will be available at `http://localhost:3000`

## 📁 Project Structure

```
vee-app/
├── app/                      # Next.js App Router pages
│   ├── page.tsx             # Home page with CTA
│   ├── viva/                # Viva examination room
│   └── start/               # Configuration page (optional)
├── components/
│   ├── ui/                  # shadcn/ui components
│   └── viva/                # Custom viva components
│       ├── VoiceSelector.tsx
│       ├── ThinkingConfig.tsx
│       └── SessionTimer.tsx
├── lib/
│   ├── api/                 # Backend API client
│   ├── gemini/              # Gemini Live API integration
│   ├── hooks/               # Custom React hooks
│   └── store/               # Zustand state management
└── types/                   # TypeScript type definitions
```

## 🎨 Key Components

### VoiceSelector
Dropdown for selecting AI voice personality.

### ThinkingConfig
Toggle and slider for configuring AI thinking capabilities.

### SessionTimer
10-minute countdown with visual warnings at 2 min and 1 min.

### useVivaSession Hook
Manages complete session lifecycle:
- Gemini Live API connection
- Audio streaming
- Tool call handling
- Session cleanup

## 🔌 Backend Integration

The frontend connects to the FastAPI backend running on `http://localhost:8000`.

**Required Backend Endpoints:**
- `POST /api/v1/viva/start` - Start new session
- `POST /api/v1/viva/get-next-question` - Get next question
- `POST /api/v1/viva/evaluate-response` - Evaluate answer
- `POST /api/v1/viva/conclude-viva` - End session

## 🎯 User Flow

1. **Home Page** → Click "Try Beta Version"
2. **Viva Room** → Fill in basic info (name, topic, class level)
3. **Configure** → Select voice and thinking settings
4. **Start Session** → AI connects and begins examination
5. **Conversation** → Speak naturally with AI examiner
6. **Auto-conclude** → Session ends after 10 minutes or manually

## 🧪 Testing

```bash
# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

## 📝 Code Quality

- ✅ **TypeScript** - Full type safety
- ✅ **JSDoc Comments** - Comprehensive documentation
- ✅ **Modular Architecture** - Clean separation of concerns
- ✅ **Error Handling** - Graceful error recovery
- ✅ **Accessibility** - ARIA labels and keyboard navigation

## 🎨 Theme

Uses custom color palette from `globals.css`:
- **Pumpkin** - Primary accent color
- **Jasper** - Secondary accent
- **White Smoke** - Neutral backgrounds

## 🔐 Security

- Ephemeral tokens for Gemini Live API
- No API keys exposed in frontend
- Server-to-server authentication

## 📄 License

MIT

## 🤝 Contributing

This is a beta version. Feedback welcome!
