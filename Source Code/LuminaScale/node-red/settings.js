module.exports = {
  flowFile: "flows.json",
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || "local-development-only",
  editorTheme: { projects: { enabled: false } },
  functionExternalModules: false,
  logging: { console: { level: "info", metrics: false, audit: false } },
};

