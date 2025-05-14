# CalorieTrack - AI-Powered Calorie Tracking App

CalorieTrack is a mobile-friendly web application designed to help users easily track their daily calorie intake. It leverages AI to estimate calories from meal descriptions or photos, providing a modern and intuitive user experience.

## Key Features

*   **AI Calorie Estimation**: Submit meal details via text or by taking a photo, and the OpenAI GPT-4o API will estimate the calories.
*   **AI Meal Description**: If only a photo is uploaded, the app generates a short description of the meal using AI.
*   **Customizable Daily Goal**: Users can set and adjust their daily calorie intake goal.
*   **Real-time Progress**: A visual progress bar shows calories consumed against the daily goal.
*   **Persistent Storage**: Daily goal, current day's meal log, consumed calories, and historical data are saved in the browser's `localStorage`.
*   **Automatic Daily Reset**: Consumed calories and the meal log reset automatically at midnight (local time).
*   **Historical Data**: View past days' total consumed calories, daily goals at the time, and detailed meal logs.
*   **Editable Log**: Delete entries from the current day's meal log.
*   **Mobile-First Design**: Styled with Tailwind CSS for a responsive and clean interface on all devices.
*   **Direct Camera Access**: "Take Photo" button attempts to directly open the device camera for convenience.
*   **Disclaimer**: Includes a reminder that AI estimations can be inaccurate and are for informational purposes.

## Tech Stack

*   **Frontend**:
    *   React
    *   Next.js 15+ (App Router)
    *   TypeScript
*   **Styling**:
    *   Tailwind CSS 4.1
    *   PostCSS & Autoprefixer
*   **AI Integration**:
    *   OpenAI API (GPT-4o)
*   **Linting/Formatting**: (Assumed based on typical Next.js setup, can be adjusted)
    *   ESLint
    *   Prettier

## Project Structure

*   `src/app/page.tsx`: Main application component containing UI and logic.
*   `src/app/layout.tsx`: Root layout component, sets up global styles and font.
*   `src/app/globals.css`: Global CSS file, imports Tailwind CSS.
*   `tailwind.config.ts`: Tailwind CSS configuration.
*   `postcss.config.mjs`: PostCSS configuration.
*   `tsconfig.json`: TypeScript configuration.
*   `.env.local`: For storing environment variables (e.g., OpenAI API key). **This file should not be committed to version control.**
*   `.gitignore`: Specifies intentionally untracked files that Git should ignore.
*   `README.md`: This file - project overview and setup instructions.

## Getting Started

### Prerequisites

*   Node.js (LTS version recommended)
*   npm (or yarn/pnpm)
*   An OpenAI API key

### Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd calorietrack 
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a file named `.env.local` in the root of your project and add your OpenAI API key:
    ```plaintext
    NEXT_PUBLIC_OPENAI_KEY=your_openai_api_key_here
    ```
    Replace `your_openai_api_key_here` with your actual API key.

### Running Locally

To start the development server:
```bash
npm run dev
```
The application will be accessible at `http://localhost:3000`.

### Building for Production

To create a production build:
```bash
npm run build
```
To start the production server after building:
```bash
npm run start
```

## Deployment

This Next.js application is ready for deployment on platforms like Vercel, Netlify, or any Node.js hosting environment.

Ensure that your environment variables (specifically `NEXT_PUBLIC_OPENAI_KEY`) are correctly configured in your deployment platform's settings.

During deployment, common issues to watch for include:
*   Ensuring all necessary dependencies (including devDependencies like `@types/*` packages for TypeScript, and build tools like `tailwindcss`, `@tailwindcss/postcss`) are correctly listed in `package.json` so they are installed in the build environment.
*   Correct `tsconfig.json` settings, particularly `moduleResolution` (often `'bundler'` or `'node16'` is preferred for modern projects).

---

This README provides a good starting point. You can expand it further with more details as the project evolves! 