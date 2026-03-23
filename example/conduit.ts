import { createConduitApp } from '@conduit/core';
// import { app as slack } from "@conduit/slack";
import { app as whatsapp } from '@conduit/whatsapp';
// import { app as discord } from "@conduit/discord";

export const app = createConduitApp({ whatsapp });
