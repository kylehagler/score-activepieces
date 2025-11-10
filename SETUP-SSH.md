# Fix SSH Authentication for Deployment

## The Problem

Your SSH key has a passphrase, which causes two issues:
1. **Annoying**: You have to enter it multiple times during deployment
2. **Breaks automation**: The script can't prompt for it in non-interactive mode

## Solution: Remove the Passphrase

Run this in your terminal:

```bash
ssh-keygen -p -f ~/.ssh/id_rsa
```

When prompted:
1. **Enter old passphrase**: [Type your current passphrase]
2. **Enter new passphrase (empty for no passphrase)**: [Just press Enter]
3. **Enter same passphrase again**: [Just press Enter]

You should see:
```
Your identification has been saved with the new passphrase.
```

## Verify It Works

Test the connection:

```bash
ssh root@165.227.213.9 'echo "SSH works!"'
```

You should NOT be prompted for a passphrase anymore.

## Security Note

Removing the passphrase is safe if:
- ✅ Your laptop has disk encryption (FileVault on macOS)
- ✅ Your user account has a password
- ✅ You're the only user of this machine

The passphrase protects the SSH key if someone steals your laptop. But disk encryption provides the same protection.

## Alternative: Use SSH Agent (Keep Passphrase)

If you want to keep the passphrase but avoid typing it repeatedly:

```bash
# Start SSH agent
eval "$(ssh-agent -s)"

# Add your key (will prompt for passphrase once)
ssh-add ~/.ssh/id_rsa

# Test connection (no passphrase needed)
ssh root@165.227.213.9 'echo "SSH works!"'
```

The agent will remember your passphrase until you restart your computer.

## After Fixing SSH

Re-run the deployment:

```bash
./deploy-simple.sh 165.227.213.9 flows.score.insure
```

It should now run smoothly without timeouts!
