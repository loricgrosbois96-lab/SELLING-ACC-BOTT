const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
} = require("discord.js");

const config = require("./config.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

/* =========================================================
   CONFIG ROBLOX
========================================================= */

const ROBLOX_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ROBLOX_MAX_RETRIES = 10;
const ROBLOX_RETRY_DELAY = 5000;

/* =========================================================
   CACHE
========================================================= */

const robloxCache = new Map();

/* =========================================================
   UTILITAIRES
========================================================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Accepte :
 * "PseudoRoblox"
 *
 * ou :
 * { username: "PseudoRoblox" }
 *
 * ou :
 * { name: "PseudoRoblox" }
 */
function getRobloxUsername(account) {
  if (typeof account === "string") {
    return account.trim();
  }

  if (account && typeof account.username === "string") {
    return account.username.trim();
  }

  if (account && typeof account.name === "string") {
    return account.name.trim();
  }

  if (account && typeof account.robloxUsername === "string") {
    return account.robloxUsername.trim();
  }

  return null;
}

/* =========================================================
   FETCH ROBLOX AVEC RETRY
========================================================= */

async function robloxFetch(url, options = {}) {
  for (let attempt = 1; attempt <= ROBLOX_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return await response.json();
      }

      if (
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        console.log(
          `⚠️ Roblox HTTP ${response.status} - tentative ${attempt}/${ROBLOX_MAX_RETRIES}`
        );

        if (attempt < ROBLOX_MAX_RETRIES) {
          await sleep(ROBLOX_RETRY_DELAY);
          continue;
        }
      }

      throw new Error(`Roblox HTTP ${response.status}`);
    } catch (error) {
      console.log(
        `⚠️ Erreur Roblox - tentative ${attempt}/${ROBLOX_MAX_RETRIES}: ${error.message}`
      );

      if (attempt < ROBLOX_MAX_RETRIES) {
        await sleep(ROBLOX_RETRY_DELAY);
      } else {
        throw error;
      }
    }
  }

  throw new Error("Impossible de contacter Roblox.");
}

/* =========================================================
   RECHERCHE UTILISATEUR ROBLOX
========================================================= */

async function getRobloxUser(username) {
  if (!username || typeof username !== "string") {
    throw new Error("Nom d'utilisateur Roblox invalide.");
  }

  const cleanUsername = username.trim();

  if (!cleanUsername) {
    throw new Error("Nom d'utilisateur Roblox vide.");
  }

  const url =
    "https://users.roblox.com/v1/usernames/users";

  const data = await robloxFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      usernames: [cleanUsername],
      excludeBannedUsers: false,
    }),
  });

  if (!data || !data.data || !data.data.length) {
    throw new Error(`Utilisateur Roblox introuvable : ${cleanUsername}`);
  }

  return data.data[0];
}

/* =========================================================
   STATS ROBLOX
========================================================= */

async function getRobloxStats(userId) {
  const friendsUrl =
    `https://friends.roblox.com/v1/users/${userId}/friends/count`;

  const followersUrl =
    `https://friends.roblox.com/v1/users/${userId}/followers/count`;

  const followingUrl =
    `https://friends.roblox.com/v1/users/${userId}/followings/count`;

  const [friends, followers, following] = await Promise.all([
    robloxFetch(friendsUrl),
    robloxFetch(followersUrl),
    robloxFetch(followingUrl),
  ]);

  if (
    typeof friends?.count !== "number" ||
    typeof followers?.count !== "number" ||
    typeof following?.count !== "number"
  ) {
    throw new Error("Stats Roblox invalides.");
  }

  return {
    friends: friends.count,
    followers: followers.count,
    following: following.count,
  };
}

/* =========================================================
   AVATAR ROBLOX
========================================================= */

async function getRobloxAvatar(userId) {
  const url =
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;

  const data = await robloxFetch(url);

  if (!data?.data?.[0]?.imageUrl) {
    throw new Error("Avatar Roblox introuvable.");
  }

  return data.data[0].imageUrl;
}

/* =========================================================
   DONNÉES COMPLÈTES DU COMPTE
========================================================= */

async function getAccountData(account) {
  const username = getRobloxUsername(account);

  if (!username) {
    throw new Error(
      "Nom d'utilisateur Roblox invalide dans config.robloxAccounts."
    );
  }

  console.log(`🔎 Recherche Roblox : ${username}`);

  const user = await getRobloxUser(username);

  if (!user?.id) {
    throw new Error(`ID Roblox introuvable pour ${username}`);
  }

  const userId = user.id;

  console.log(`👤 ${username} → ID ${userId}`);

  const stats = await getRobloxStats(userId);

  let avatar = null;

  try {
    avatar = await getRobloxAvatar(userId);
  } catch (error) {
    console.log(
      `⚠️ Avatar indisponible pour ${username}: ${error.message}`
    );
  }

  return {
    username: user.name || username,
    displayName: user.displayName || user.name || username,
    userId,
    friends: stats.friends,
    followers: stats.followers,
    following: stats.following,
    avatar,
  };
}

/* =========================================================
   RETRY JUSQU'À RÉUSSITE
========================================================= */

async function getAccountDataUntilSuccess(account) {
  const username = getRobloxUsername(account);

  if (!username) {
    throw new Error(
      "Impossible de trouver le username Roblox dans la configuration."
    );
  }

  let attempt = 1;

  while (true) {
    try {
      console.log(
        `🔄 Récupération de ${username} - tentative ${attempt}`
      );

      const data = await getAccountData(username);

      console.log(`✅ Données récupérées pour ${username}`);

      return data;
    } catch (error) {
      console.log(
        `❌ Erreur pour ${username}: ${error.message}`
      );

      console.log(
        `⏳ Nouvelle tentative dans ${ROBLOX_RETRY_DELAY / 1000}s...`
      );

      attempt++;

      await sleep(ROBLOX_RETRY_DELAY);
    }
  }
}

/* =========================================================
   CRÉATION EMBED ROBLOX
========================================================= */

function createRobloxEmbed(data) {
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${data.displayName}`)
    .setDescription(
      `Informations du compte Roblox **${data.username}**`
    )
    .addFields(
      {
        name: "👥 Amis",
        value: `${data.friends.toLocaleString("fr-FR")}`,
        inline: true,
      },
      {
        name: "👤 Abonnés",
        value: `${data.followers.toLocaleString("fr-FR")}`,
        inline: true,
      },
      {
        name: "➡️ Abonnements",
        value: `${data.following.toLocaleString("fr-FR")}`,
        inline: true,
      }
    )
    .setFooter({
      text: "Mise à jour automatique toutes les 5 minutes",
    })
    .setTimestamp();

  if (data.avatar) {
    embed.setThumbnail(data.avatar);
  }

  return embed;
}

/* =========================================================
   MISE À JOUR DU MESSAGE ROBLOX
========================================================= */

async function updateSellingMessage() {
  try {
    if (!config.robloxAccounts || !Array.isArray(config.robloxAccounts)) {
      console.log(
        "❌ config.robloxAccounts n'est pas un tableau."
      );
      return;
    }

    if (!config.robloxAccounts.length) {
      console.log(
        "❌ Aucun compte Roblox configuré."
      );
      return;
    }

    console.log(
      `🎮 Mise à jour de ${config.robloxAccounts.length} compte(s) Roblox...`
    );

    const accountsData = [];

    /*
     * On récupère TOUS les comptes.
     * Si Roblox rencontre un problème, on attend puis on recommence.
     */
    for (let i = 0; i < config.robloxAccounts.length; i++) {
      const account = config.robloxAccounts[i];

      const username = getRobloxUsername(account);

      console.log(
        `🎮 Compte ${i + 1}/${config.robloxAccounts.length} : ${username || "[USERNAME INVALIDE]"}`
      );

      if (!username) {
        console.log(
          `❌ Compte ${i + 1} invalide dans config.js`
        );
        return;
      }

      const data = await getAccountDataUntilSuccess(username);

      accountsData.push(data);
    }

    console.log(
      "✅ Tous les comptes Roblox ont été récupérés."
    );

    /* =====================================================
       MESSAGE DISCORD
    ===================================================== */

    const channelId = config.robloxChannelId;
    const messageId = config.robloxMessageId;

    if (!channelId) {
      console.log(
        "❌ robloxChannelId manquant dans config.js"
      );
      return;
    }

    const channel = await client.channels.fetch(channelId);

    if (!channel) {
      console.log(
        "❌ Salon Roblox introuvable."
      );
      return;
    }

    let message = null;

    if (messageId) {
      try {
        message = await channel.messages.fetch(messageId);
      } catch {
        message = null;
      }
    }

    /*
     * Si le message n'existe pas, on en crée un.
     */
    if (!message) {
      const embeds = accountsData.map(createRobloxEmbed);

      message = await channel.send({
        embeds,
      });

      console.log(
        `📨 Nouveau message Roblox créé : ${message.id}`
      );

      /*
       * Si ton config.js utilise une variable robloxMessageId,
       * pense à mettre cet ID dedans après le premier lancement.
       */
    } else {
      const embeds = accountsData.map(createRobloxEmbed);

      await message.edit({
        embeds,
      });

      console.log(
        "🔄 Message Roblox mis à jour."
      );
    }
  } catch (error) {
    console.error(
      "❌ Erreur updateSellingMessage :",
      error
    );
  }
}

/* =========================================================
   PANEL TICKET
========================================================= */

async function createTicketPanel() {
  try {
    if (!config.ticketChannelId) {
      console.log(
        "⚠️ ticketChannelId manquant."
      );
      return;
    }

    const channel = await client.channels.fetch(
      config.ticketChannelId
    );

    if (!channel) return;

    const messages = await channel.messages.fetch({
      limit: 50,
    });

    const alreadyExists = messages.some((message) =>
      message.components?.some((row) =>
        row.components?.some(
          (component) =>
            component.customId === "create_ticket"
        )
      )
    );

    if (alreadyExists) {
      console.log("🎫 Panel ticket déjà présent.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎫 Support")
      .setDescription(
        "Besoin d'aide ? Clique sur le bouton ci-dessous pour créer un ticket."
      )
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId("create_ticket")
      .setLabel("Créer un ticket")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    console.log("🎫 Panel ticket créé.");
  } catch (error) {
    console.error(
      "❌ Erreur panel ticket :",
      error
    );
  }
}

/* =========================================================
   PANEL RÈGLEMENT
========================================================= */

async function createRulesPanel() {
  try {
    if (!config.rulesChannelId) {
      console.log(
        "⚠️ rulesChannelId manquant."
      );
      return;
    }

    const channel = await client.channels.fetch(
      config.rulesChannelId
    );

    if (!channel) return;

    const messages = await channel.messages.fetch({
      limit: 50,
    });

    const alreadyExists = messages.some((message) =>
      message.components?.some((row) =>
        row.components?.some(
          (component) =>
            component.customId === "accept_rules"
        )
      )
    );

    if (alreadyExists) {
      console.log("📜 Panel règlement déjà présent.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📜 Règlement")
      .setDescription(
        "Lis attentivement le règlement puis clique sur le bouton pour l'accepter."
      )
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId("accept_rules")
      .setLabel("J'accepte le règlement")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    console.log("📜 Panel règlement créé.");
  } catch (error) {
    console.error(
      "❌ Erreur panel règlement :",
      error
    );
  }
}

/* =========================================================
   INTERACTIONS
========================================================= */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  /* =======================================================
     CRÉATION TICKET
  ======================================================= */

  if (interaction.customId === "create_ticket") {
    try {
      await interaction.deferReply({
        ephemeral: true,
      });

      const guild = interaction.guild;

      if (!guild) {
        await interaction.editReply(
          "❌ Cette action doit être utilisée sur un serveur."
        );
        return;
      }

      const existingChannel = guild.channels.cache.find(
        (channel) =>
          channel.name ===
          `ticket-${interaction.user.username.toLowerCase()}`
      );

      if (existingChannel) {
        await interaction.editReply(
          `❌ Tu as déjà un ticket : ${existingChannel}`
        );
        return;
      }

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ];

      if (config.ticketRoleId) {
        permissionOverwrites.push({
          id: config.ticketRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites,
      });

      const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket")
        .setDescription(
          `Bonjour ${interaction.user}, explique ton problème ici.`
        )
        .setTimestamp();

      const closeButton = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Fermer")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(
        closeButton
      );

      await ticketChannel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [embed],
        components: [row],
      });

      await interaction.editReply(
        `✅ Ticket créé : ${ticketChannel}`
      );

      console.log(
        `🎫 Ticket créé pour ${interaction.user.username}`
      );
    } catch (error) {
      console.error(
        "❌ Erreur création ticket :",
        error
      );

      if (interaction.deferred) {
        await interaction.editReply(
          "❌ Impossible de créer le ticket."
        );
      }
    }

    return;
  }

  /* =======================================================
     FERMETURE TICKET
  ======================================================= */

  if (interaction.customId === "close_ticket") {
    try {
      await interaction.reply({
        content: "🔒 Fermeture du ticket...",
      });

      await sleep(2000);

      await interaction.channel.delete();
    } catch (error) {
      console.error(
        "❌ Erreur fermeture ticket :",
        error
      );
    }

    return;
  }

  /* =======================================================
     ACCEPTATION RÈGLEMENT
  ======================================================= */

  if (interaction.customId === "accept_rules") {
    try {
      const roleId = config.memberRoleId;

      if (!roleId) {
        await interaction.reply({
          content:
            "❌ Le rôle membre n'est pas configuré.",
          ephemeral: true,
        });

        return;
      }

      const role = interaction.guild.roles.cache.get(
        roleId
      );

      if (!role) {
        await interaction.reply({
          content:
            "❌ Le rôle configuré est introuvable.",
          ephemeral: true,
        });

        return;
      }

      await interaction.member.roles.add(role);

      await interaction.reply({
        content:
          "✅ Règlement accepté ! Tu as maintenant accès au serveur.",
        ephemeral: true,
      });

      console.log(
        `📜 Règlement accepté par ${interaction.user.username}`
      );
    } catch (error) {
      console.error(
        "❌ Erreur acceptation règlement :",
        error
      );

      if (!interaction.replied) {
        await interaction.reply({
          content:
            "❌ Impossible de te donner le rôle.",
          ephemeral: true,
        });
      }
    }
  }
});

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);

  /* Panels */
  await createTicketPanel();
  await createRulesPanel();

  /* Première mise à jour Roblox */
  await updateSellingMessage();

  /*
   * Mise à jour automatique toutes les 5 minutes
   */
  setInterval(async () => {
    console.log(
      "⏰ Mise à jour Roblox automatique..."
    );

    await updateSellingMessage();
  }, ROBLOX_UPDATE_INTERVAL);
});

/* =========================================================
   ERREURS
========================================================= */

process.on("unhandledRejection", (error) => {
  console.error(
    "❌ Unhandled Rejection :",
    error
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    "❌ Uncaught Exception :",
    error
  );
});

/* =========================================================
   LOGIN
========================================================= */

if (!config.token) {
  console.error(
    "❌ Aucun token Discord trouvé dans config.js"
  );
  process.exit(1);
}

client.login(config.token);
