// commands/ask.js — !ask command (OpenAI chat completion)

const { OpenAI } = require('openai');
const { RateLimitError } = require('../errorHandler');
const config = require('../config');

const DEFAULT_SYSTEM_PROMPT =
  'You are a friendly, helpful Discord bot. Be concise, conversational, and clear.';
const DEFAULT_ERROR_MESSAGE =
  "Sorry, I can't reach the AI right now. Try again in a bit!";

module.exports = {
  name: 'ask',
  description: 'Ask the OpenAI assistant anything.',
  rateLimit: { limit: 3, window: 300000 }, // 3 uses per 5 minutes (expensive API calls)

  async execute(message, args, db, EmbedBuilder) {
    const prompt = args.join(' ');
    if (!prompt) {
      return message.reply('Please ask me a question, e.g., `!ask Who is the fastest runner?`');
    }

    if (!process.env.OPENAI_API_KEY) {
      return message.reply('⚠️ OpenAI features are not configured. Contact an admin.');
    }

    const branding = config.branding || {};
    const systemPrompt = branding.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT;
    const aiErrorMessage = branding.aiErrorMessage || DEFAULT_ERROR_MESSAGE;

    await message.channel.sendTyping();

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        max_tokens: 200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ]
      });

      let reply = completion.choices[0].message.content.trim();

      // Optional: Reformat code blocks if detected
      if (reply.includes("```")) {
        reply = reply.replace(/```/g, "```js");
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${message.author.displayName} asked:`,
          iconURL: message.author.displayAvatarURL()
        })
        .setDescription(`**Question:** ${prompt}\n\n**Answer:** ${reply}`)
        .setColor(0x00AE86)
        .setFooter({ text: 'Powered by OpenAI • Rate limited for fair usage' });

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('OpenAI API error:', error);

      if (error.code === 'insufficient_quota') {
        return message.reply('⚠️ AI quota exceeded. Try again later or contact an admin.');
      } else if (error.code === 'rate_limit_exceeded') {
        return message.reply('🕒 AI is being used heavily. Try again in a few minutes.');
      } else {
        return message.reply(aiErrorMessage);
      }
    }
  }
};
