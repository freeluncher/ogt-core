import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#8B1E2D', // sesuai warna header template quotation (docGenerator/template docx)
      },
    },
  },
  plugins: [],
};

export default config;
