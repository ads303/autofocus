# LensGPT (Camera Lens Settings Assistant)

This is the little demo we built: a 2D spinning lens UI that calls the OpenAI API
to suggest camera settings for any scene you describe.

## Quick start (macOS)

1. Install Node.js (if you don't have it yet)

   - Go to https://nodejs.org and install the **LTS** version.
   - Then in Terminal, run:

     ```bash
     node -v
     npm -v
     ```

     to confirm both commands work.

2. Move this folder somewhere convenient (e.g., `~/Projects/camera-lens-gpt`).

3. In Terminal, `cd` into the folder:

   ```bash
   cd ~/Projects/camera-lens-gpt
   ```

4. Install dependencies:

   ```bash
   npm install
   ```

5. Create a `.env` file in this folder with your OpenAI API key:

   ```bash
   echo "OPENAI_API_KEY=sk-your-key-here" > .env
   ```

   Replace `sk-your-key-here` with your actual key from the OpenAI dashboard.

6. Start the server:

   ```bash
   npm start
   ```

7. Open your browser to:

   ```text
   http://localhost:3000
   ```

8. Describe a scene/camera/lens, click **Get settings**, and watch the lens UI
   twist to the suggested aperture, shutter, and ISO.
