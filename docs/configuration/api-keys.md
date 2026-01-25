# API Keys Configuration

Guide for managing LLM provider API keys in Crucible Community Edition.

## Overview

Crucible uses a "Bring Your Own Key" (BYOK) model. You provide your own API keys for LLM providers, and you are responsible for all API usage costs.

## Supported Providers

### OpenRouter (Recommended)

Provides access to multiple LLM providers through a single API key.

**Advantages:**
- Access to many models (OpenAI, Anthropic, Google, etc.)
- Unified billing
- Easy model switching

**Setup:**
1. Get API key from [OpenRouter](https://openrouter.ai/)
2. Configure in UI Settings or environment variable

### Direct Provider Keys

You can also configure keys directly:

- **OpenAI**: Direct OpenAI API access
- **Anthropic**: Direct Claude API access
- **Google**: Direct Gemini API access
- **DeepSeek**: Specialized reasoning models
- **Others**: Various providers via OpenRouter

## Configuration Methods

### Method 1: UI Settings (Recommended)

1. **Login to Crucible**
2. **Navigate to Settings**
3. **Go to "API Keys" section**
4. **Enter your API keys**
5. **Save**

**Advantages:**
- No need to edit configuration files
- Keys are encrypted and stored securely
- Easy to update

### Method 2: Environment Variables

Set in `.env` file:

```bash
# OpenRouter (recommended)
ROUNDTABLE_OPENROUTER_API_KEY=sk-or-v1-...

# Eden AI (optional)
ROUNDTABLE_EDEN_AI_API_KEY=...
```

**Advantages:**
- Can be set before first login
- Works for automated deployments
- Can be managed via infrastructure tools

## API Key Security

### Encryption

- API keys are encrypted at rest using Fernet encryption
- Encryption key is stored in `API_KEY_ENCRYPTION_KEY` environment variable
- Keys are never stored in plain text

### Best Practices

- **Never commit API keys** to version control
- **Backup `.env` file** - Contains encryption key needed to decrypt stored keys
- **Rotate keys regularly** - Update keys periodically
- **Use separate keys** - Use different keys for development and production
- **Monitor usage** - Track API usage and costs

## Getting API Keys

### OpenRouter

1. Sign up at https://openrouter.ai/
2. Navigate to Keys section
3. Create a new API key
4. Copy the key (starts with `sk-or-v1-`)

### OpenAI

1. Sign up at https://platform.openai.com/
2. Navigate to API Keys
3. Create a new secret key
4. Copy the key (starts with `sk-`)

### Anthropic

1. Sign up at https://platform.claude.com/
2. Navigate to API Keys
3. Create a new key
4. Copy the key (starts with `sk-ant-`)

### Google (Gemini)

1. Sign up at https://ai.google.dev/
2. Create a new API key
3. Copy the key

### Deepseek

1. Sign up at https://platform.deepseek.com
2. Create a new API key
3. Copy the key

### xAI

1. Sign up at https://x.ai/api
2. Create a new API key
3. Copy the key


## Usage and Costs

### Cost Responsibility

**You are responsible for:**
- All API usage costs
- Rate limit overages
- Subscription fees
- Any charges from API providers

**The Crucible Team is NOT responsible for:**
- API costs
- Provider account issues
- Rate limiting
- Service interruptions

### Monitoring Usage

- Check API provider dashboards for usage
- Monitor costs in provider accounts
- Set up billing alerts if available
- Review usage patterns in Crucible

### Rate Limits

Each provider has different rate limits:
- Check provider documentation
- Monitor rate limit errors in Crucible
- Consider upgrading provider plans if needed

## Troubleshooting

### API Key Not Working

1. Verify key is correct (no extra spaces)
2. Check key format (provider-specific)
3. Verify key has sufficient credits/quota
4. Check provider status page
5. Review API logs: `docker compose logs api`

### Rate Limit Errors

1. Check provider rate limits
2. Reduce request frequency
3. Upgrade provider plan if needed
4. Use different providers for different tasks

### Encryption Key Lost

If `API_KEY_ENCRYPTION_KEY` changes:
- All encrypted API keys become unrecoverable
- Users must re-enter keys in Settings
- **Always backup `.env` file**

## Next Steps

- [Security Configuration](security.md) - Security best practices
- [Environment Variables Reference](../deployment/environment-variables.md) - Complete variable list
- [Troubleshooting](../deployment/troubleshooting.md) - Common issues
