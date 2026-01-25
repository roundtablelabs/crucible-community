# First Steps After Installation

Congratulations! You've installed Crucible Community Edition. Here's what to do next.

## Initial Login

1. **Access the application:**
   - Open http://localhost:3000 in your browser

2. **Login credentials:**
   - **Email**: `admin@community.local`
   - **Password**: Check your terminal output or `.env` file for `ROUNDTABLE_COMMUNITY_AUTH_PASSWORD`
   - The password is displayed when you first start the services

3. **Change your password (Recommended):**
   - See [Configuration Guide](../configuration/README.md) for password hashing instructions

## Configure API Keys

To use LLM features, you'll need to configure API keys:

1. **Navigate to Settings:**
   - Click on your profile or navigate to Settings page
   - Go to "API Keys" section

2. **Add OpenRouter API Key (Recommended):**
   - Get your key from [OpenRouter](https://openrouter.ai/)
   - Enter it in the Settings page
   - This gives you access to multiple LLM providers

3. **Or add Direct Provider Keys:**
   - OpenAI, Anthropic, Google, etc.
   - Each provider has its own key format

> **Note**: API keys are encrypted and stored securely. You are responsible for all API usage costs.

## Create Your First Session

1. **Navigate to Boardroom:**
   - This is your main workspace

2. **Start an Intake:**
   - Use the Intake Assistant to describe your decision question
   - Upload documents if needed
   - Let the assistant help you frame your question

3. **Launch a Debate:**
   - Select your knights (AI experts)
   - Review and confirm your question
   - Watch the live debate unfold

4. **Review Results:**
   - Access Decision Briefs and Minutes
   - Download PDFs
   - Review the debate history

## Explore Features

### Knights (AI Experts)
- Browse prebuilt knights in the Knights page
- Each knight has a specific expertise area
- Select diverse perspectives for comprehensive analysis

### Sessions
- View all your debate sessions
- Access historical sessions
- Download artifacts

### Settings
- Manage API keys
- Configure model preferences
- Customize your experience

## Customization

### Security
- Change default password
- Configure security settings
- See [Security Configuration](../configuration/security.md)

## Common Tasks

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f frontend
```

### Stop Services
```bash
docker compose down
```

### Restart Services
```bash
docker compose restart
```

### Update to Latest Version
```bash
docker compose pull && docker compose up -d
```

## Next Steps

- [Configuration Guide](../configuration/README.md) - Customize your deployment
- [Deployment Guide](../deployment/README.md) - Production considerations
- [Development Guide](../development/README.md) - Contribute to the project
- [Troubleshooting](../deployment/troubleshooting.md) - Common issues

## Getting Help

- Check [Troubleshooting Guide](../deployment/troubleshooting.md) for common issues
- Review [Documentation](../README.md) for detailed guides
- Search existing [GitHub Issues](https://github.com/roundtable-labs/crucible-community/issues)

## Tips

- **Backup your `.env` file** - It contains encryption keys needed to decrypt stored API keys
- **Save your password** - Store it securely, as it's needed for login
- **Monitor API usage** - Keep track of your API costs
- **Regular updates** - Pull latest images for bug fixes and improvements

Enjoy using Crucible Community Edition!
