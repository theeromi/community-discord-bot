/**
 * News Feed System for Dimandem Bot
 * Fetches and posts news from RSS feeds to designated Discord channels
 */

const { EmbedBuilder } = require('discord.js');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');
const config = require('./config');
const { getPrimaryGuild } = require('./utils');

class NewsFeed {
  constructor(db, client) {
    this.db = db;
    this.client = client;
    this.parser = null;
    this.initialized = false;
    
    // Feed configurations - Personalized for Romi's interests
    // NOTE: Reddit RSS is blocked (403), using alternative sources
    this.feeds = {
      // Tech News - Categorized by interest
      techNews: [
        // 🏠 Homelab
        { 
          name: 'ServeTheHome', 
          url: 'https://www.servethehome.com/feed/',
          category: 'homelab',
          emoji: '🏠'
        },
        { 
          name: 'Ars Technica', 
          url: 'https://feeds.arstechnica.com/arstechnica/index',
          category: 'homelab',
          emoji: '🖥️'
        },
        // 🔐 Security
        { 
          name: 'Krebs on Security', 
          url: 'https://krebsonsecurity.com/feed/',
          category: 'security',
          emoji: '🔐'
        },
        { 
          name: 'The Hacker News', 
          url: 'https://feeds.feedburner.com/TheHackersNews',
          category: 'security',
          emoji: '🔐'
        },
        { 
          name: 'Schneier on Security', 
          url: 'https://www.schneier.com/feed/atom/',
          category: 'security',
          emoji: '🔐'
        },
        { 
          name: 'CISA Alerts', 
          url: 'https://www.cisa.gov/news.xml',
          category: 'security',
          emoji: '🛡️'
        },
        // 💻 Development
        { 
          name: 'Hacker News', 
          url: 'https://news.ycombinator.com/rss',
          category: 'dev',
          emoji: '💻'
        },
        { 
          name: 'DEV Community', 
          url: 'https://dev.to/feed',
          category: 'dev',
          emoji: '💻'
        },
        { 
          name: 'Lobsters', 
          url: 'https://lobste.rs/rss',
          category: 'dev',
          emoji: '🦞'
        },
        // 🤖 AI/ML
        { 
          name: 'MIT Tech Review - AI', 
          url: 'https://www.technologyreview.com/feed/',
          category: 'ai',
          emoji: '🤖'
        },
        // OpenAI Blog removed — 403s the bot's UA since mid-2025
        // 💰 Deals & Hardware
        {
          name: 'Toms Hardware',
          url: 'https://www.tomshardware.com/feeds/all',
          category: 'deals',
          emoji: '💰'
        },
        // AnandTech removed — site shut down in 2025, RSS no longer maintained
        // 🐳 Docker/Cloud
        { 
          name: 'Docker Blog', 
          url: 'https://www.docker.com/blog/feed/',
          category: 'homelab',
          emoji: '🐳'
        }
      ],
      
      // Call of Duty News - Non-Reddit sources
      codNews: [
        { 
          name: 'Dexerto Gaming', 
          url: 'https://www.dexerto.com/feed/',
          category: 'gaming',
          emoji: '🎮'
        },
        { 
          name: 'GameSpot', 
          url: 'https://www.gamespot.com/feeds/news/',
          category: 'gaming',
          emoji: '🎮'
        },
        { 
          name: 'IGN', 
          url: 'https://feeds.feedburner.com/ign/all',
          category: 'gaming',
          emoji: '🎮'
        },
        { 
          name: 'Kotaku', 
          url: 'https://kotaku.com/rss',
          category: 'gaming',
          emoji: '🎮'
        },
        { 
          name: 'PC Gamer', 
          url: 'https://www.pcgamer.com/rss/',
          category: 'gaming',
          emoji: '🖥️'
        }
      ]
    };
  }
  
  async initialize() {
    try {
      // Dynamically import rss-parser (ESM module)
      const RSSParser = require('rss-parser');
      this.parser = new RSSParser({
        timeout: 10000,
        headers: {
          'User-Agent': `${(config.branding && config.branding.botName) || 'DiscordBot'}/1.0 (Discord Bot)`
        }
      });
      
      // Create database table for tracking posted articles
      await this.createTable();
      this.initialized = true;
      logWithTimestamp('News Feed system initialized');
      return true;
    } catch (error) {
      errorWithTimestamp('Failed to initialize News Feed system:', error);
      return false;
    }
  }
  
  async createTable() {
    return new Promise((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS posted_news (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feed_category TEXT NOT NULL,
          article_url TEXT NOT NULL UNIQUE,
          article_title TEXT,
          posted_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else {
          // Create index for faster lookups
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_posted_news_url ON posted_news(article_url)`, resolve);
        }
      });
    });
  }
  
  async isPosted(url) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id FROM posted_news WHERE article_url = ?', [url], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
  }
  
  async markAsPosted(category, url, title) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO posted_news (feed_category, article_url, article_title) VALUES (?, ?, ?)',
        [category, url, title],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
  
  async cleanupOldPosts(daysToKeep = 30) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM posted_news WHERE posted_at < datetime('now', '-${daysToKeep} days')`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
  
  // Fisher-Yates shuffle for mixing articles from different sources
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  
  async fetchFeed(feedConfig) {
    if (!this.parser) return [];
    
    try {
      const feed = await this.parser.parseURL(feedConfig.url);
      return feed.items.slice(0, 10).map(item => ({
        title: item.title || 'No title',
        link: item.link || item.guid,
        description: this.cleanDescription(item.contentSnippet || item.content || item.description || ''),
        pubDate: item.pubDate || item.isoDate,
        source: feedConfig.name,
        category: feedConfig.category,
        emoji: feedConfig.emoji  // Pass emoji from feed config
      }));
    } catch (error) {
      errorWithTimestamp(`Failed to fetch feed ${feedConfig.name}:`, error.message);
      return [];
    }
  }
  
  cleanDescription(text) {
    if (!text) return '';
    // Remove HTML tags, decode entities, limit length
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .substring(0, 300) + (text.length > 300 ? '...' : '');
  }
  
  // Get category-specific styling
  getCategoryStyle(category) {
    const styles = {
      // Tech categories
      'homelab': { color: 0x5865F2, emoji: '🏠', label: 'Homelab' },
      'security': { color: 0xED4245, emoji: '🔐', label: 'Security' },
      'dev': { color: 0x57F287, emoji: '💻', label: 'Development' },
      'deals': { color: 0xFEE75C, emoji: '💰', label: 'Deals' },
      'ai': { color: 0xEB459E, emoji: '🤖', label: 'AI/ML' },
      // Gaming
      'gaming': { color: 0x1A1A1A, emoji: '🎮', label: 'Gaming' },
    };
    return styles[category] || { color: 0x5865F2, emoji: '📰', label: 'News' };
  }
  
  createEmbed(article, feedType = 'techNews') {
    const catStyle = this.getCategoryStyle(article.category);
    
    // Use article's emoji if available, otherwise use category emoji
    const emoji = article.emoji || catStyle.emoji;
    
    // Create a cleaner title with emoji
    const title = `${emoji} ${article.title.substring(0, 245)}`;
    
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setURL(article.link)
      .setColor(catStyle.color)
      .setTimestamp(article.pubDate ? new Date(article.pubDate) : new Date());
    
    // Add description with better formatting
    if (article.description && article.description.length > 10) {
      const cleanDesc = article.description.substring(0, 300);
      embed.setDescription(cleanDesc);
    }
    
    // Add source as author for cleaner look
    embed.setAuthor({ 
      name: `${catStyle.emoji} ${catStyle.label} • ${article.source}`,
    });
    
    // Add clickable link button-style
    embed.addFields({
      name: '\u200B',  // Zero-width space for cleaner look
      value: `**[📖 Read Full Article →](${article.link})**`,
      inline: false
    });
    
    // Footer with timestamp indicator
    embed.setFooter({ 
      text: `via ${article.source}`
    });
    
    return embed;
  }

  resolveNewsChannel(guild, preferredChannelIdOrName, feedType) {
    const preferred = guild.channels.cache.get(preferredChannelIdOrName) ||
                      guild.channels.cache.find(ch => ch.name === preferredChannelIdOrName);

    if (preferred && preferred.isTextBased() && preferred.send) {
      return { channel: preferred, usedFallback: false };
    }

    const fallback = guild.channels.cache.get(config.generalChannelId) ||
                     guild.channels.cache.find(ch => ch.name === config.generalChannelName);

    if (fallback && fallback.isTextBased() && fallback.send) {
      errorWithTimestamp(
        `News channel unavailable for ${feedType}: ${preferredChannelIdOrName}. Falling back to ${fallback.name} (${fallback.id}).`
      );
      return { channel: fallback, usedFallback: true };
    }

    return { channel: null, usedFallback: false };
  }
  
  async fetchAndPostNews(feedType, channelId, maxPosts = 3) {
    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) return { success: false, posted: 0 };
    }
    
    const feeds = this.feeds[feedType];
    if (!feeds) {
      errorWithTimestamp(`Unknown feed type: ${feedType}`);
      return { success: false, posted: 0 };
    }
    
    const guild = getPrimaryGuild(this.client);
    if (!guild) return { success: false, posted: 0 };
    
    const { channel, usedFallback } = this.resolveNewsChannel(guild, channelId, feedType);
    if (!channel) {
      errorWithTimestamp(`No valid news channel found for ${feedType}. Requested: ${channelId}`);
      return { success: false, posted: 0 };
    }

    if (usedFallback) {
      logWithTimestamp(`Posting ${feedType} to fallback channel: ${channel.name}`);
    }
    
    // Collect ALL articles from ALL feeds first, then mix them
    let allArticles = [];
    
    for (const feedConfig of feeds) {
      try {
        const articles = await this.fetchFeed(feedConfig);
        // Add feed info to each article and filter
        for (const article of articles) {
          if (!article.link) continue;
          
          // Less strict filtering for CoD (Reddit titles can be short)
          const minTitleLength = feedType === 'codNews' ? 10 : 15;
          if (article.title.length < minTitleLength) continue;
          
          const alreadyPosted = await this.isPosted(article.link);
          if (alreadyPosted) continue;
          
          allArticles.push(article);
        }
      } catch (error) {
        errorWithTimestamp(`Error fetching feed ${feedConfig.name}:`, error.message);
      }
    }
    
    // Shuffle articles to get mix from different sources
    allArticles = this.shuffleArray(allArticles);
    
    // Also try to get variety - pick from different categories/sources
    const postedSources = new Set();
    const diverseArticles = [];
    const remainingArticles = [];
    
    // First pass: get one from each unique source
    for (const article of allArticles) {
      if (!postedSources.has(article.source)) {
        diverseArticles.push(article);
        postedSources.add(article.source);
      } else {
        remainingArticles.push(article);
      }
    }
    
    // Combine: diverse first, then remaining
    const sortedArticles = [...diverseArticles, ...remainingArticles];
    
    let totalPosted = 0;
    
    for (const article of sortedArticles) {
      if (totalPosted >= maxPosts) break;
      
      try {
        const embed = this.createEmbed(article, feedType);
        await channel.send({ embeds: [embed] });
        await this.markAsPosted(feedType, article.link, article.title);
        totalPosted++;
        
        logWithTimestamp(
          `Posted ${feedType} news to #${channel.name}: "${article.title.substring(0, 50)}..." from ${article.source}`
        );
        
        // Small delay between posts to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        errorWithTimestamp(`Error posting article:`, error.message);
      }
    }
    
    if (totalPosted === 0) {
      logWithTimestamp(`No new articles found for ${feedType}. Total candidates checked: ${allArticles.length}`);
    }
    
    return { success: true, posted: totalPosted };
  }
  
  async postTechNews(channelId, maxPosts = 3) {
    return this.fetchAndPostNews('techNews', channelId, maxPosts);
  }
  
  async postCodNews(channelId, maxPosts = 3) {
    return this.fetchAndPostNews('codNews', channelId, maxPosts);
  }
}

module.exports = { NewsFeed };
