import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from "next-auth/adapters";
import type { Pool } from "pg";

export function createRoundtableAuthAdapter(pool: Pool): Adapter {
  // Helper function to get user by ID
  // Map database columns to NextAuth adapter format:
  // full_name -> name, avatar_url -> image, email_verified_at -> emailVerified
  const getUser = async (id: string): Promise<AdapterUser | null> => {
    const result = await pool.query<{
      id: string;
      full_name: string | null;
      email: string;
      email_verified_at: Date | null;
      avatar_url: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, full_name, email, email_verified_at, avatar_url, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    // AdapterUser only includes: id, name, email, emailVerified, image
    // createdAt and updatedAt are not part of the AdapterUser interface
    return {
      id: row.id,
      name: row.full_name,
      email: row.email,
      emailVerified: row.email_verified_at,
      image: row.avatar_url,
    };
  };

  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO users (id, full_name, email, email_verified_at, avatar_url, role, professional_profile_verified, studio_attempt_count, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'member', FALSE, 0, NOW(), NOW())
         RETURNING id`,
        [user.name, user.email, user.emailVerified, user.image]
      );
      return {
        id: result.rows[0].id,
        ...user,
      };
    },

    async getUser(id: string) {
      return getUser(id);
    },

    async getUserByEmail(email: string) {
      const result = await pool.query<{
        id: string;
        full_name: string | null;
        email: string;
        email_verified_at: Date | null;
        avatar_url: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, full_name, email, email_verified_at, avatar_url, created_at, updated_at
         FROM users WHERE email = $1`,
        [email]
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      // AdapterUser only includes: id, name, email, emailVerified, image
      return {
        id: row.id,
        name: row.full_name,
        email: row.email,
        emailVerified: row.email_verified_at,
        image: row.avatar_url,
      };
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const result = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM user_accounts
         WHERE provider = $1 AND provider_account_id = $2`,
        [provider, providerAccountId]
      );
      if (!result.rows[0]) return null;
      const user = await getUser(result.rows[0].user_id);
      console.log(`[getUserByAccount] Found ${provider} account linked to user ${result.rows[0].user_id.substring(0, 8)}... (email: ${user?.email || 'unknown'})`);
      return user;
    },

    async updateUser(user: Partial<AdapterUser> & { id: string }) {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (user.name !== undefined) {
        updates.push(`full_name = $${paramIndex++}`);
        values.push(user.name);
      }
      if (user.email !== undefined) {
        updates.push(`email = $${paramIndex++}`);
        values.push(user.email);
      }
      if (user.emailVerified !== undefined) {
        updates.push(`email_verified_at = $${paramIndex++}`);
        values.push(user.emailVerified);
      }
      if (user.image !== undefined) {
        updates.push(`avatar_url = $${paramIndex++}`);
        values.push(user.image);
      }

      if (updates.length === 0) {
        const updatedUser = await getUser(user.id);
        if (!updatedUser) {
          throw new Error(`User with id ${user.id} not found`);
        }
        return updatedUser;
      }

      updates.push(`updated_at = NOW()`);
      values.push(user.id);

      await pool.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
        values
      );
      const updatedUser = await getUser(user.id);
      if (!updatedUser) {
        throw new Error(`User with id ${user.id} not found after update`);
      }
      return updatedUser;
    },

    async linkAccount(account: AdapterAccount) {
      console.log(`[linkAccount] Attempting to link ${account.provider} account ${account.providerAccountId.substring(0, 8)}... to user ${account.userId.substring(0, 8)}...`);
      // Use transaction with row-level locking to prevent race conditions
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Lock the row if it exists to prevent race conditions
        const existingAccount = await client.query<{ user_id: string }>(
          `SELECT user_id FROM user_accounts
           WHERE provider = $1 AND provider_account_id = $2
           FOR UPDATE`,
          [account.provider, account.providerAccountId]
        );
        
        if (existingAccount.rows[0]) {
          const existingUserId = existingAccount.rows[0].user_id;
          // If already linked to the same user, just update metadata
          if (existingUserId === account.userId) {
            await client.query(
              `UPDATE user_accounts 
               SET email = COALESCE($1, email),
                   last_used_at = NOW()
               WHERE provider = $2 AND provider_account_id = $3`,
              [account.email || null, account.provider, account.providerAccountId]
            );
            await client.query('COMMIT');
            return account;
          }
          
          // Account is linked to a different user - check if we should merge
          // Get both users' emails to check if they match
          const [currentUser, existingUser] = await Promise.all([
            getUser(account.userId),
            getUser(existingUserId)
          ]);
          
          // If emails match, merge the accounts (transfer account from existing user to current user)
          if (currentUser?.email && existingUser?.email && 
              currentUser.email.toLowerCase() === existingUser.email.toLowerCase()) {
            console.log(`[linkAccount] Merging accounts: transferring ${account.provider} from user ${existingUserId.substring(0, 8)}... to ${account.userId.substring(0, 8)}... (same email: ${currentUser.email})`);
            
            // Transfer the account link to the current user
            await client.query(
              `UPDATE user_accounts 
               SET user_id = $1, email = COALESCE($2, email), last_used_at = NOW()
               WHERE provider = $3 AND provider_account_id = $4`,
              [account.userId, account.email || null, account.provider, account.providerAccountId]
            );
            
            // Transfer any other accounts from the existing user to current user
            await client.query(
              `UPDATE user_accounts 
               SET user_id = $1, last_used_at = NOW()
               WHERE user_id = $2`,
              [account.userId, existingUserId]
            );
            
            await client.query('COMMIT');
            return account;
          }
          
          // Emails don't match - this is account hijacking, throw error
          // This prevents User B from linking an account that belongs to User A (different email)
          console.warn(`[linkAccount] Account hijacking attempt: ${account.provider} account is linked to user ${existingUserId.substring(0, 8)}... (email: ${existingUser?.email || 'unknown'}) but current user is ${account.userId.substring(0, 8)}... (email: ${currentUser?.email || 'unknown'})`);
          await client.query('ROLLBACK');
          throw new Error("OAuthAccountNotLinked");
        }
        
        // Auto-verify email since OAuth providers (Google/LinkedIn/Microsoft) already verify emails
        if (account.email) {
          const user = await getUser(account.userId);
          if (!user?.emailVerified) {
            await client.query(
              `UPDATE users SET email_verified_at = NOW() WHERE id = $1`,
              [account.userId]
            );
          }
        }
        
        // Account doesn't exist, safe to link
        await client.query(
          `INSERT INTO user_accounts (id, user_id, provider, provider_account_id, email, linked_at, last_used_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())`,
          [account.userId, account.provider, account.providerAccountId, account.email || null]
        );
        
        // Log account linking for audit
        // Use user_id as resource_id since we're modifying that user's account links
        // Store provider info in resource_type (truncated to fit VARCHAR(64))
        const resourceType = `account_link:${account.provider}`.substring(0, 64);
        await client.query(
          `INSERT INTO data_access_logs (id, user_id, resource_type, resource_id, action, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'link', NOW())`,
          [account.userId, resourceType, account.userId]
        );
        
        await client.query('COMMIT');
        return account;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async unlinkAccount({ providerAccountId, provider }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Get user_id for this account
        const accountInfo = await client.query<{ user_id: string }>(
          `SELECT user_id FROM user_accounts WHERE provider = $1 AND provider_account_id = $2`,
          [provider, providerAccountId]
        );
        
        if (!accountInfo.rows[0]) {
          await client.query('ROLLBACK');
          return; // Account doesn't exist, nothing to unlink
        }
        
        const userId = accountInfo.rows[0].user_id;
        
        // Check how many accounts the user has
        const accountCount = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM user_accounts WHERE user_id = $1`,
          [userId]
        );
        
        if (parseInt(accountCount.rows[0].count) <= 1) {
          await client.query('ROLLBACK');
          throw new Error("CannotUnlinkLastAccount");
        }
        
        // Log unlinking for audit
        const resourceType = `account_link:${provider}`.substring(0, 64);
        await client.query(
          `INSERT INTO data_access_logs (id, user_id, resource_type, resource_id, action, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'unlink', NOW())`,
          [userId, resourceType, userId]
        );
        
        // Delete the account link
        await client.query(
          `DELETE FROM user_accounts WHERE provider = $1 AND provider_account_id = $2`,
          [provider, providerAccountId]
        );
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async createSession({ sessionToken, userId, expires }) {
      const result = await pool.query<AdapterSession>(
        `INSERT INTO sessions (user_id, session_token, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, user_id as "userId", session_token as "sessionToken", expires_at as "expires"`,
        [userId, sessionToken, expires]
      );
      return result.rows[0];
    },

    async getSessionAndUser(sessionToken: string) {
      const result = await pool.query<{
        id: string;
        userId: string;
        sessionToken: string;
        expires: Date;
        user_id: string;
        full_name: string | null;
        email: string;
        email_verified_at: Date | null;
        avatar_url: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT 
           s.id, s.user_id as "userId", s.session_token as "sessionToken", s.expires_at as "expires",
           u.id as "user_id", u.full_name, u.email, u.email_verified_at, u.avatar_url, u.created_at, u.updated_at
         FROM sessions s
         INNER JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1 AND s.expires_at > NOW()`,
        [sessionToken]
      );

      if (!result.rows[0]) return null;

      const row = result.rows[0];
      return {
        session: {
          id: row.id,
          userId: row.userId,
          sessionToken: row.sessionToken,
          expires: row.expires,
        },
        user: {
          id: row.user_id,
          name: row.full_name,
          email: row.email,
          emailVerified: row.email_verified_at,
          image: row.avatar_url,
        },
      };
    },

    async updateSession({ sessionToken, ...updates }) {
      const updatesList: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.expires !== undefined) {
        updatesList.push(`expires_at = $${paramIndex++}`);
        values.push(updates.expires);
      }
      if (updates.userId !== undefined) {
        updatesList.push(`user_id = $${paramIndex++}`);
        values.push(updates.userId);
      }

      if (updatesList.length === 0) {
        const result = await pool.query<AdapterSession>(
          `SELECT id, user_id as "userId", session_token as "sessionToken", expires_at as "expires"
           FROM sessions WHERE session_token = $1`,
          [sessionToken]
        );
        return result.rows[0] ?? null;
      }

      updatesList.push(`updated_at = NOW()`);
      values.push(sessionToken);

      await pool.query(
        `UPDATE sessions SET ${updatesList.join(", ")} WHERE session_token = $${paramIndex}`,
        values
      );

      const result = await pool.query<AdapterSession>(
        `SELECT id, user_id as "userId", session_token as "sessionToken", expires_at as "expires"
         FROM sessions WHERE session_token = $1`,
        [sessionToken]
      );
      return result.rows[0] ?? null;
    },

    async deleteSession(sessionToken: string) {
      await pool.query(`DELETE FROM sessions WHERE session_token = $1`, [sessionToken]);
    },

    async createVerificationToken({ identifier, expires, token }) {
      const result = await pool.query<VerificationToken>(
        `INSERT INTO verification_tokens (identifier, token, expires_at, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING identifier, token, expires_at as "expires"`,
        [identifier, token, expires]
      );
      return result.rows[0] ?? null;
    },

    async useVerificationToken({ identifier, token }) {
      const result = await pool.query<VerificationToken>(
        `DELETE FROM verification_tokens
         WHERE identifier = $1 AND token = $2
         RETURNING identifier, token, expires_at as "expires"`,
        [identifier, token]
      );
      return result.rows[0] ?? null;
    },
  };
}
