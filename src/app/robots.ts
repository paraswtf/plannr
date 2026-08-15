import { type MetadataRoute } from "next";

import { APP_PREFIXES } from "~/lib/role-nav";

/**
 * Everything behind the session gate is private, so crawlers are pointed at the
 * sign-in page and nothing else. The disallow list is derived from the route
 * ACL, so a new screen is covered the moment it appears in the nav.
 *
 * This does not affect link previews: WhatsApp, Slack and iMessage fetch
 * Open Graph tags without consulting robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login"],
      // robots.txt matches on prefix, so "/rooms" covers "/rooms/42" too.
      disallow: ["/api/", ...APP_PREFIXES],
    },
  };
}
