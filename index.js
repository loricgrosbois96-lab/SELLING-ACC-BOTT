const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  MessageFlags,
} = require("discord.js");

const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// ======================================================
// CONFIGURATION
// ======================================================

const ROBLOX_UPDATE_INTERVAL = 5 * 60 * 1000;

// Cache utilisateur : 1 heure
const ROBLOX_USER_CACHE_TIME = 60 * 60 * 1000;

// Cache avatar : 10 minutes
const ROBLOX_AVATAR_CACHE_TIME = 10 * 60 * 1000;

// Nombre de tentatives pour une requête individuelle
const ROBLOX_MAX_RETRIES = 10;

// Temps entre deux tentatives
const ROBLOX_RETRY_DELAY = 5000;

// Pause entre les comptes
const ROBLOX_ACCOUNT_DELAY = 1500;

// ======================================================
// CACHE
// ======================================================

const cachedUsers = new Map();
const cachedStats = new Map();
const cachedAvatars = new Map();

let updateInProgress = false;

// ======================================================
// UTILITAIRES
// ======================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ======================================================
// REQUÊTE ROBLOX AVEC RETRY
// ======================================================

async function robloxFetch(url, options = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= ROBLOX_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);

      // Succès
      if (response.ok) {
        return response;
      }

      // Rate limit Roblox
      if (response.status === 429) {
        const retryAfterHeader =
          response.headers.get("retry-after");

        const retryAfter =
          Number(retryAfterHeader) || 10;

        console.log(
          `⚠️ Roblox rate-limit (${url})`
        );

        console.log(
          `⏳ Nouvelle tentative dans ${retryAfter}s...`
        );

        await sleep(retryAfter * 1000);

        continue;
      }

      // Erreur temporaire serveur
      if (
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        console.log(
          `⚠️ Roblox HTTP ${response.status}`
        );

        console.log(
          `🔄 Tentative ${attempt}/${ROBLOX_MAX_RETRIES}...`
        );

        await sleep(ROBLOX_RETRY_DELAY);

        continue;
      }

      throw new Error(
        `Roblox HTTP ${response.status}`
      );
    } catch (error) {
      lastError = error;

      console.log(
        `⚠️ Erreur requête Roblox : ${error.message}`
      );

      if (attempt < ROBLOX_MAX_RETRIES) {
        console.log(
          `🔄 Nouvelle tentative ${attempt + 1}/${ROBLOX_MAX_RETRIES} dans ${ROBLOX_RETRY_DELAY / 1000}s...`
        );

        await sleep(ROBLOX_RETRY_DELAY);
      }
    }
  }

  throw (
    lastError ||
    new Error("Impossible de contacter Roblox.")
  );
}

// ======================================================
// ROBLOX USER
// ======================================================

async function getRobloxUser(username) {
  const key = username.toLowerCase().trim();

  const cached = cachedUsers.get(key);

  if (
    cached &&
    Date.now() - cached.time <
      ROBLOX_USER_CACHE_TIME
  ) {
    return cached.user;
  }

  try {
    const response = await robloxFetch(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          usernames: [username],
          excludeBannedUsers: false,
        }),
      }
    );

    const data = await response.json();

    if (
      !data.data ||
      data.data.length === 0
    ) {
      console.log(
        `❌ Utilisateur Roblox introuvable : ${username}`
      );

      return null;
    }

    const user = data.data[0];

    cachedUsers.set(key, {
      user,
      time: Date.now(),
    });

    return user;
  } catch (error) {
    console.error(
      `❌ Impossible de récupérer ${username} :`,
      error
    );

    return cached?.user || null;
  }
}

// ======================================================
// RÉCUPÉRATION DES STATISTIQUES
// ======================================================

async function getRobloxStats(userId) {
  console.log(
    `📊 Récupération des statistiques de ${userId}...`
  );

  // --------------------------------------------------
  // AMIS
  // --------------------------------------------------

  const friendsResponse = await robloxFetch(
    `https://friends.roblox.com/v1/users/${userId}/friends/count`
  );

  const friendsData =
    await friendsResponse.json();

  await sleep(500);

  // --------------------------------------------------
  // FOLLOWERS
  // --------------------------------------------------

  const followersResponse = await robloxFetch(
    `https://friends.roblox.com/v1/users/${userId}/followers/count`
  );

  const followersData =
    await followersResponse.json();

  await sleep(500);

  // --------------------------------------------------
  // FOLLOWING
  // --------------------------------------------------

  const followingResponse = await robloxFetch(
    `https://friends.roblox.com/v1/users/${userId}/followings/count`
  );

  const followingData =
    await followingResponse.json();

  // --------------------------------------------------
  // VÉRIFICATION
  // --------------------------------------------------

  if (
    typeof friendsData.count !== "number" ||
    typeof followersData.count !== "number" ||
    typeof followingData.count !== "number"
  ) {
    throw new Error(
      "Roblox n'a pas retourné les 3 statistiques correctement."
    );
  }

  const stats = {
    friends: friendsData.count,
    followers: followersData.count,
    following: followingData.count,
  };

  // Sauvegarde uniquement après avoir obtenu
  // les TROIS statistiques.
  cachedStats.set(userId, {
    stats,
    time: Date.now(),
  });

  console.log(
    `✅ Statistiques récupérées pour ${userId}`
  );

  console.log(
    `👥 Amis : ${stats.friends}`
  );

  console.log(
    `👤 Followers : ${stats.followers}`
  );

  console.log(
    `➡️ Following : ${stats.following}`
  );

  return stats;
}

// ======================================================
// RETRY DES STATISTIQUES JUSQU'À RÉUSSITE
// ======================================================

async function getRobloxStatsUntilSuccess(userId) {
  let attempt = 0;

  while (true) {
    attempt++;

    try {
      console.log(
        `🔄 Mise à jour statistiques ${userId} - tentative ${attempt}`
      );

      const stats =
        await getRobloxStats(userId);

      // Vérification finale
      if (
        stats &&
        typeof stats.friends === "number" &&
        typeof stats.followers === "number" &&
        typeof stats.following === "number"
      ) {
        console.log(
          `✅ Les 3 statistiques sont valides pour ${userId}.`
        );

        return stats;
      }

      throw new Error(
        "Les statistiques reçues sont incomplètes."
      );
    } catch (error) {
      console.error(
        `❌ Tentative ${attempt} échouée pour ${userId} :`,
        error.message
      );

      console.log(
        `⏳ Nouvelle tentative dans ${ROBLOX_RETRY_DELAY / 1000}s...`
      );

      await sleep(ROBLOX_RETRY_DELAY);
    }
  }
}

// ======================================================
// AVATAR ROBLOX
// ======================================================

async function getRobloxAvatar(userId) {
  const cached = cachedAvatars.get(userId);

  if (
    cached &&
    Date.now() - cached.time <
      ROBLOX_AVATAR_CACHE_TIME
  ) {
    return cached.avatar;
  }

  try {
    const response = await robloxFetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );

    const data = await response.json();

    const avatar =
      data?.data?.[0]?.imageUrl || null;

    if (avatar) {
      cachedAvatars.set(userId, {
        avatar,
        time: Date.now(),
      });
    }

    return avatar;
  } catch (error) {
    console.error(
      `❌ Erreur avatar Roblox ${userId} :`,
      error
    );

    return cached?.avatar || null;
  }
}

// ======================================================
// DONNÉES COMPLÈTES DU COMPTE
// ======================================================

async function getAccountData(account) {
  const user =
    await getRobloxUser(account);

  if (!user) {
    throw new Error(
      `Impossible de trouver le compte Roblox ${account}.`
    );
  }

  // IMPORTANT :
  // On attend réellement les 3 statistiques.
  const stats =
    await getRobloxStatsUntilSuccess(
      user.id
    );

  const avatar =
    await getRobloxAvatar(user.id);

  return {
    ...user,
    stats,
    avatar,
  };
}

// ======================================================
// EMBED ROBLOX
// ======================================================

function createAccountEmbed(account) {
  const stats = account.stats;

  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${account.name}`)
    .setDescription(
      `**Nom d'affichage :** ${account.displayName}\n` +
        `**Username :** @${account.name}\n` +
        `**ID Roblox :** ${account.id}\n\n` +
        `👥 **Amis :** ${stats.friends}\n` +
        `👤 **Followers :** ${stats.followers}\n` +
        `➡️ **Following :** ${stats.following}\n\n` +
        `🔄 **Mise à jour automatique toutes les 5 minutes**`
    )
    .setColor(0x5865f2)
    .setFooter({
      text: "LoricBot • Informations Roblox",
    })
    .setTimestamp();

  if (account.avatar) {
    embed.setThumbnail(account.avatar);
  }

  return embed;
}

// ======================================================
// RECONNAÎTRE UN MESSAGE ROBLOX
// ======================================================

function isRobloxMessage(message) {
  if (
    !client.user ||
    message.author.id !== client.user.id
  ) {
    return false;
  }

  const embed = message.embeds?.[0];

  if (!embed) {
    return false;
  }

  const title = embed.title || "";
  const footer = embed.footer?.text || "";

  return (
    title.startsWith("🎮 ") &&
    footer.includes(
      "LoricBot • Informations Roblox"
    )
  );
}

// ======================================================
// MISE À JOUR DES COMPTES
// ======================================================

async function updateSellingMessage() {
  if (updateInProgress) {
    console.log(
      "⏳ Une mise à jour est déjà en cours."
    );

    return;
  }

  updateInProgress = true;

  try {
    if (!config.sellingChannelId) {
      console.log(
        "❌ sellingChannelId absent dans config.js"
      );

      return;
    }

    if (
      !Array.isArray(config.robloxAccounts) ||
      config.robloxAccounts.length === 0
    ) {
      console.log(
        "❌ Aucun compte Roblox configuré."
      );

      return;
    }

    const channel =
      await client.channels.fetch(
        config.sellingChannelId
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.log(
        "❌ Salon Roblox introuvable."
      );

      return;
    }

    console.log(
      "=========================================="
    );

    console.log(
      "🔄 DÉBUT MISE À JOUR ROBLOX"
    );

    console.log(
      "=========================================="
    );

    const accountsData = [];

    // ==================================================
    // RÉCUPÉRER TOUS LES COMPTES
    // ==================================================

    for (
      let i = 0;
      i < config.robloxAccounts.length;
      i++
    ) {
      const account =
        config.robloxAccounts[i];

      console.log(
        `\n🎮 Compte ${i + 1}/${config.robloxAccounts.length} : ${account}`
      );

      try {
        // Cette fonction ne termine PAS tant que
        // les statistiques n'ont pas été récupérées.
        const data =
          await getAccountData(account);

        accountsData.push(data);

        console.log(
          `✅ ${account} complètement récupéré.`
        );

        await sleep(
          ROBLOX_ACCOUNT_DELAY
        );
      } catch (error) {
        console.error(
          `❌ Erreur définitive pour ${account} :`,
          error
        );

        // On ne crée pas de message avec des données
        // incomplètes.
      }
    }

    // ==================================================
    // SI UN COMPTE N'A PAS ÉTÉ RÉCUPÉRÉ
    // ==================================================

    if (
      accountsData.length !==
      config.robloxAccounts.length
    ) {
      console.log(
        "⚠️ Tous les comptes n'ont pas pu être récupérés."
      );

      console.log(
        "⏭️ Les messages existants ne seront pas remplacés par des données incomplètes."
      );

      return;
    }

    // ==================================================
    // RÉCUPÉRATION DES MESSAGES
    // ==================================================

    const messages =
      await channel.messages.fetch({
        limit: 100,
      });

    const robloxMessages =
      messages
        .filter((message) =>
          isRobloxMessage(message)
        )
        .sort(
          (a, b) =>
            a.createdTimestamp -
            b.createdTimestamp
        );

    // ==================================================
    // MODIFICATION / CRÉATION
    // ==================================================

    for (
      let i = 0;
      i < accountsData.length;
      i++
    ) {
      const account =
        accountsData[i];

      const embed =
        createAccountEmbed(account);

      const existingMessage =
        robloxMessages[i];

      if (existingMessage) {
        await existingMessage.edit({
          embeds: [embed],
        });

        console.log(
          `✏️ Message actualisé : ${account.name}`
        );
      } else {
        await channel.send({
          embeds: [embed],
        });

        console.log(
          `📨 Message créé : ${account.name}`
        );
      }

      await sleep(1000);
    }

    // ==================================================
    // SUPPRESSION DES ANCIENS MESSAGES
    // ==================================================

    if (
      robloxMessages.length >
      accountsData.length
    ) {
      const oldMessages =
        robloxMessages.slice(
          accountsData.length
        );

      for (const message of oldMessages) {
        try {
          await message.delete();

          console.log(
            "🗑️ Ancien message Roblox supprimé."
          );

          await sleep(500);
        } catch (error) {
          console.error(
            "❌ Erreur suppression message :",
            error
          );
        }
      }
    }

    console.log(
      "\n=========================================="
    );

    console.log(
      `✅ MISE À JOUR TERMINÉE - ${new Date().toLocaleTimeString("fr-FR")}`
    );

    console.log(
      "==========================================\n"
    );
  } catch (error) {
    console.error(
      "❌ Erreur mise à jour Roblox :",
      error
    );
  } finally {
    updateInProgress = false;
  }
}

// ======================================================
// PANEL TICKET
// ======================================================

async function sendTicketPanel() {
  try {
    if (!config.ticketChannelId) {
      console.log(
        "⚠️ ticketChannelId absent."
      );

      return;
    }

    const channel =
      await client.channels.fetch(
        config.ticketChannelId
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.log(
        "❌ Salon ticket invalide."
      );

      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 100,
      });

    const alreadyExists =
      messages.some(
        (message) =>
          message.author.id ===
            client.user.id &&
          message.embeds?.[0]?.title ===
            "🎫 Support"
      );

    if (alreadyExists) {
      console.log(
        "🎫 Panel ticket déjà présent."
      );

      return;
    }

    const embed =
      new EmbedBuilder()
        .setTitle("🎫 Support")
        .setDescription(
          "Besoin d'aide ?\n\n" +
            "Clique sur le bouton ci-dessous pour créer un ticket."
        )
        .setColor(0x5865f2)
        .setFooter({
          text: "LoricBot • Support",
        });

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            "create_ticket"
          )
          .setLabel(
            "Créer un ticket"
          )
          .setEmoji("🎫")
          .setStyle(
            ButtonStyle.Primary
          )
      );

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    console.log(
      "✅ Panel ticket envoyé."
    );
  } catch (error) {
    console.error(
      "❌ Erreur panel ticket :",
      error
    );
  }
}

// ======================================================
// PANEL RÈGLEMENT
// ======================================================

async function sendRulesPanel() {
  try {
    if (!config.rulesChannelId) {
      console.log(
        "⚠️ rulesChannelId absent."
      );

      return;
    }

    const channel =
      await client.channels.fetch(
        config.rulesChannelId
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.log(
        "❌ Salon règlement invalide."
      );

      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 100,
      });

    const alreadyExists =
      messages.some(
        (message) =>
          message.author.id ===
            client.user.id &&
          message.embeds?.[0]?.title ===
            "📜 Règlement du serveur"
      );

    if (alreadyExists) {
      console.log(
        "📜 Panel règlement déjà présent."
      );

      return;
    }

    const embed =
      new EmbedBuilder()
        .setTitle(
          "📜 Règlement du serveur"
        )
        .setDescription(
          "Merci de lire et respecter le règlement du serveur.\n\n" +
            "Après avoir lu le règlement, clique sur le bouton ci-dessous."
        )
        .setColor(0x2ecc71)
        .setFooter({
          text: "LoricBot • Règlement",
        });

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            "accept_rules"
          )
          .setLabel(
            "J'accepte le règlement"
          )
          .setEmoji("✅")
          .setStyle(
            ButtonStyle.Success
          )
      );

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    console.log(
      "✅ Panel règlement envoyé."
    );
  } catch (error) {
    console.error(
      "❌ Erreur panel règlement :",
      error
    );
  }
}

// ======================================================
// BOT PRÊT
// ======================================================

client.once(
  "clientReady",
  async () => {
    console.log(
      `🤖 Connecté en tant que ${client.user.tag}`
    );

    console.log(
      "🔄 Mise à jour Roblox toutes les 5 minutes."
    );

    await sendTicketPanel();

    await sendRulesPanel();

    // Première mise à jour immédiatement
    await updateSellingMessage();

    // Puis toutes les 5 minutes
    setInterval(
      updateSellingMessage,
      ROBLOX_UPDATE_INTERVAL
    );
  }
);

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
  "interactionCreate",
  async (interaction) => {
    if (!interaction.isButton()) {
      return;
    }

    // ==================================================
    // CRÉER TICKET
    // ==================================================

    if (
      interaction.customId ===
      "create_ticket"
    ) {
      try {
        const guild =
          interaction.guild;

        if (!guild) {
          return interaction.reply({
            content:
              "❌ Cette action doit être utilisée sur un serveur.",
            flags:
              MessageFlags.Ephemeral,
          });
        }

        const username =
          interaction.user.username
            .toLowerCase()
            .replace(
              /[^a-z0-9-_]/g,
              "-"
            )
            .slice(0, 25);

        const ticketName =
          `ticket-${username}`;

        const existingChannel =
          guild.channels.cache.find(
            (channel) =>
              channel.name ===
                ticketName &&
              channel.type ===
                ChannelType.GuildText
          );

        if (existingChannel) {
          return interaction.reply({
            content:
              `❌ Tu as déjà un ticket : ${existingChannel}`,
            flags:
              MessageFlags.Ephemeral,
          });
        }

        const permissionOverwrites =
          [
            {
              id: guild.roles.everyone.id,
              deny: [
                PermissionsBitField.Flags
                  .ViewChannel,
              ],
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags
                  .ViewChannel,
                PermissionsBitField.Flags
                  .SendMessages,
                PermissionsBitField.Flags
                  .ReadMessageHistory,
              ],
            },
          ];

        if (config.staffRoleId) {
          permissionOverwrites.push({
            id: config.staffRoleId,
            allow: [
              PermissionsBitField.Flags
                .ViewChannel,
              PermissionsBitField.Flags
                .SendMessages,
              PermissionsBitField.Flags
                .ReadMessageHistory,
            ],
          });
        }

        const ticketChannel =
          await guild.channels.create(
            {
              name: ticketName,
              type:
                ChannelType.GuildText,
              permissionOverwrites,
            }
          );

        const embed =
          new EmbedBuilder()
            .setTitle("🎫 Ticket")
            .setDescription(
              `Bonjour ${interaction.user} !\n\n` +
                "Un membre du staff va bientôt prendre en charge ton ticket.\n\n" +
                "Merci de décrire ton problème avec le plus de détails possible."
            )
            .setColor(0x5865f2)
            .setFooter({
              text: "LoricBot • Support",
            })
            .setTimestamp();

        await ticketChannel.send({
          content:
            `${interaction.user}`,
          embeds: [embed],
        });

        await interaction.reply({
          content:
            `✅ Ton ticket a été créé : ${ticketChannel}`,
          flags:
            MessageFlags.Ephemeral,
        });

        console.log(
          `🎫 Ticket créé pour ${interaction.user.tag}`
        );
      } catch (error) {
        console.error(
          "❌ Erreur création ticket :",
          error
        );

        if (!interaction.replied) {
          await interaction.reply({
            content:
              "❌ Impossible de créer le ticket. Vérifie les permissions du bot.",
            flags:
              MessageFlags.Ephemeral,
          });
        }
      }
    }

    // ==================================================
    // ACCEPTER RÈGLEMENT
    // ==================================================

    if (
      interaction.customId ===
      "accept_rules"
    ) {
      try {
        if (!interaction.guild) {
          return interaction.reply({
            content:
              "❌ Cette action doit être utilisée sur un serveur.",
            flags:
              MessageFlags.Ephemeral,
          });
        }

        if (!config.verifiedRoleId) {
          return interaction.reply({
            content:
              "❌ Le rôle VerifiedMember n'est pas configuré.",
            flags:
              MessageFlags.Ephemeral,
          });
        }

        const member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );

        const role =
          await interaction.guild.roles.fetch(
            config.verifiedRoleId
          );

        if (!role) {
          return interaction.reply({
            content:
              "❌ Le rôle configuré est introuvable.",
            flags:
              MessageFlags.Ephemeral,
          });
        }

        if (
          member.roles.cache.has(
            role.id
          )
        ) {
          return interaction.reply({
            content:
              "ℹ️ Tu as déjà accepté le règlement.",
            flags:
              MessageFlags.Ephemeral,
          });
        }

        await member.roles.add(role);

        await interaction.reply({
          content:
            "✅ Tu as accepté le règlement et reçu ton rôle !",
          flags:
            MessageFlags.Ephemeral,
        });

        console.log(
          `✅ Rôle ${role.name} donné à ${interaction.user.tag}`
        );
      } catch (error) {
        console.error(
          "❌ Erreur attribution rôle :",
          error
        );

        if (!interaction.replied) {
          await interaction.reply({
            content:
              "❌ Impossible de donner le rôle. Vérifie que le bot possède la permission `Gérer les rôles` et que son rôle est placé au-dessus du rôle VerifiedMember.",
            flags:
              MessageFlags.Ephemeral,
          });
        }
      }
    }
  }
);

// ======================================================
// CONNEXION
// ======================================================

if (!config.token) {
  console.error(
    "❌ Token Discord absent dans config.js"
  );

  process.exit(1);
}

client.login(config.token);
