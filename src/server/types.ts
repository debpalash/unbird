// SPDX-License-Identifier: AGPL-3.0-only
// Ported from nitter/src/types.nim

// --- Error Types ---

export class RateLimitError extends Error {
  constructor(msg = "Rate limited") {
    super(msg);
    this.name = "RateLimitError";
  }
}

export class NoSessionsError extends Error {
  constructor(msg = "No sessions available") {
    super(msg);
    this.name = "NoSessionsError";
  }
}

export class InternalError extends Error {
  constructor(msg = "Internal error") {
    super(msg);
    this.name = "InternalError";
  }
}

export class BadClientError extends Error {
  constructor(msg = "Bad client") {
    super(msg);
    this.name = "BadClientError";
  }
}

// --- Enums ---

export enum TimelineKind {
  Tweets = "tweets",
  Replies = "replies",
  Media = "media",
}

export enum QueryKind {
  Posts = "posts",
  Replies = "replies",
  Media = "media",
  Users = "users",
  Tweets = "tweets",
  UserList = "userList",
}

export enum VerifiedType {
  None = "None",
  Blue = "Blue",
  Business = "Business",
  Government = "Government",
}

export enum VideoType {
  M3u8 = "application/x-mpegURL",
  Mp4 = "video/mp4",
  Vmap = "video/vmap",
}

export enum MediaKind {
  Photo = "photoMedia",
  Video = "videoMedia",
  Gif = "gifMedia",
}

export enum CardKind {
  Amplify = "amplify",
  App = "app",
  AppPlayer = "appplayer",
  Player = "player",
  Summary = "summary",
  SummaryLarge = "summary_large_image",
  PromoWebsite = "promo_website",
  PromoVideo = "promo_video_website",
  PromoVideoConvo = "promo_video_convo",
  PromoImageConvo = "promo_image_convo",
  PromoImageApp = "promo_image_app",
  StoreLink = "direct_store_link_app",
  LiveEvent = "live_event",
  Broadcast = "broadcast",
  Periscope = "periscope_broadcast",
  Unified = "unified_card",
  Moment = "moment",
  MessageMe = "message_me",
  VideoDirectMessage = "video_direct_message",
  ImageDirectMessage = "image_direct_message",
  AudioSpace = "audiospace",
  NewsletterPublication = "newsletter_publication",
  JobDetails = "job_details",
  Hidden = "hidden",
  Unknown = "unknown",
}

export enum SessionKind {
  OAuth = "oauth",
  Cookie = "cookie",
}

export enum ErrorCode {
  Null = 0,
  NoUserMatches = 17,
  ProtectedUser = 22,
  MissingParams = 25,
  Timeout = 29,
  CouldntAuth = 32,
  DoesntExist = 34,
  Unauthorized = 37,
  InvalidParam = 47,
  UserNotFound = 50,
  Suspended = 63,
  RateLimited = 88,
  ExpiredToken = 89,
  ListIdOrSlug = 112,
  TweetNotFound = 144,
  TweetNotAuthorized = 179,
  Forbidden = 200,
  BadRequest = 214,
  BadToken = 239,
  Locked = 326,
  NoCsrf = 353,
  TweetUnavailable = 421,
  TweetCensored = 422,
}

// --- Core Interfaces ---

export interface ApiUrl {
  endpoint: string;
  params: [string, string][];
}

export interface ApiReq {
  oauth: ApiUrl;
  cookie: ApiUrl;
  method?: string;
  body?: string;
}

export interface RateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

export interface SessionOAuth {
  kind: SessionKind.OAuth;
  id: number;
  username: string;
  pending: number;
  limited: boolean;
  limitedAt: number;
  apis: Record<string, RateLimit>;
  oauthToken: string;
  oauthSecret: string;
}

export interface SessionCookie {
  kind: SessionKind.Cookie;
  id: number;
  username: string;
  pending: number;
  limited: boolean;
  limitedAt: number;
  apis: Record<string, RateLimit>;
  authToken: string;
  ct0: string;
}

export type Session = SessionOAuth | SessionCookie;

export interface User {
  id: string;
  username: string;
  fullname: string;
  location: string;
  website: string;
  bio: string;
  userPic: string;
  banner: string;
  pinnedTweet: number;
  following: number;
  followers: number;
  tweets: number;
  likes: number;
  media: number;
  verifiedType: VerifiedType;
  protected: boolean;
  suspended: boolean;
  joinDate: Date;
  isFollowing?: boolean;
}

export interface VideoVariant {
  contentType: VideoType;
  url: string;
  bitrate: number;
  resolution: number;
}

export interface Video {
  durationMs: number;
  url: string;
  thumb: string;
  available: boolean;
  reason: string;
  title: string;
  description: string;
  playbackType: VideoType;
  variants: VideoVariant[];
}

export interface Photo {
  url: string;
  altText: string;
}

export interface Gif {
  url: string;
  thumb: string;
  altText: string;
}

export type Media =
  | { kind: MediaKind.Photo; photo: Photo }
  | { kind: MediaKind.Video; video: Video }
  | { kind: MediaKind.Gif; gif: Gif };

export interface GalleryPhoto {
  url: string;
  tweetId: string;
  color: string;
}

export type PhotoRail = GalleryPhoto[];

export interface Poll {
  options: string[];
  values: number[];
  votes: number;
  leader: number;
  status: string;
}

export interface Card {
  kind: CardKind;
  url: string;
  title: string;
  dest: string;
  text: string;
  image: string;
  video?: Video;
}

export interface TweetStats {
  replies: number;
  retweets: number;
  likes: number;
  views: number;
}

export interface Tweet {
  id: string;
  threadId: string;
  replyId: string;
  user: User;
  text: string;
  time: Date;
  reply: string[];
  pinned: boolean;
  hasThread: boolean;
  available: boolean;
  tombstone: string;
  location: string;
  source: string;
  stats: TweetStats;
  retweet?: Tweet;
  attribution?: User;
  mediaTags: User[];
  quote?: Tweet;
  card?: Card;
  poll?: Poll;
  media: Media[];
  history: string[];
  note: string;
  isAd: boolean;
  isAI: boolean;
}

export interface Query {
  kind: QueryKind;
  view: string;
  text: string;
  filters: string[];
  includes: string[];
  excludes: string[];
  fromUser: string[];
  since: string;
  until: string;
  minLikes: string;
  sep: string;
}

export interface Result<T> {
  content: T[];
  top: string;
  bottom: string;
  beginning: boolean;
  query: Query;
}

export interface Chain {
  content: Tweet[];
  hasMore: boolean;
  cursor: string;
}

export interface Conversation {
  tweet: Tweet;
  before: Chain;
  after: Chain;
  replies: Result<Chain>;
}

export interface EditHistory {
  latest: Tweet;
  history: Tweet[];
}

export type Timeline = Result<Tweet[]>;

export interface Profile {
  user: User;
  photoRail: PhotoRail;
  pinned?: Tweet;
  tweets: Timeline;
}

export interface List {
  id: string;
  name: string;
  userId: string;
  username: string;
  description: string;
  members: number;
  banner: string;
}

export interface Config {
  address: string;
  port: number;
  useHttps: boolean;
  httpMaxConns: number;
  title: string;
  hostname: string;
  staticDir: string;
  hmacKey: string;
  base64Media: boolean;
  enableDebug: boolean;
  proxy: string;
  proxyAuth: string;
}

export interface Prefs {
  replaceTwitter: string;
  replaceYouTube: string;
  replaceReddit: string;
  hlsPlayback: boolean;
  mp4Playback: boolean;
  proxyVideos: boolean;
  muteVideos: boolean;
  autoplayGifs: boolean;
  infiniteScroll: boolean;
  stickyProfile: boolean;
  stickyNav: boolean;
  bidiSupport: boolean;
  hideTweetStats: boolean;
  hideBanner: boolean;
  hidePins: boolean;
  hideReplies: boolean;
  hideCommunityNotes: boolean;
  mediaView: string;
  theme: string;
  gallerySize: string;
  compactGallery: boolean;
}

// --- Helper Functions ---

export function emptyUser(username = ""): User {
  return {
    id: "",
    username,
    fullname: "",
    location: "",
    website: "",
    bio: "",
    userPic: "",
    banner: "",
    pinnedTweet: 0,
    following: 0,
    followers: 0,
    tweets: 0,
    likes: 0,
    media: 0,
    verifiedType: VerifiedType.None,
    protected: false,
    suspended: false,
    joinDate: new Date(),
  };
}

export function emptyTweet(): Tweet {
  return {
    id: "",
    threadId: "",
    replyId: "",
    user: emptyUser(),
    text: "",
    time: new Date(),
    reply: [],
    pinned: false,
    hasThread: false,
    available: false,
    tombstone: "",
    location: "",
    source: "",
    stats: { replies: 0, retweets: 0, likes: 0, views: 0 },
    mediaTags: [],
    media: [],
    history: [],
    note: "",
    isAd: false,
    isAI: false,
  };
}

export function emptyQuery(): Query {
  return {
    kind: QueryKind.Posts,
    view: "",
    text: "",
    filters: [],
    includes: [],
    excludes: [],
    fromUser: [],
    since: "",
    until: "",
    minLikes: "",
    sep: "",
  };
}

export function emptyChain(): Chain {
  return { content: [], hasMore: false, cursor: "" };
}

export function emptyTimeline(): Timeline {
  return { content: [], top: "", bottom: "", beginning: true, query: emptyQuery() };
}

export function emptyProfile(username = ""): Profile {
  return {
    user: emptyUser(username),
    photoRail: [],
    tweets: emptyTimeline(),
  };
}

export function getPhotos(tweet: Tweet): Photo[] {
  return tweet.media
    .filter((m): m is { kind: MediaKind.Photo; photo: Photo } => m.kind === MediaKind.Photo)
    .map((m) => m.photo);
}

export function getVideos(tweet: Tweet): Video[] {
  return tweet.media
    .filter((m): m is { kind: MediaKind.Video; video: Video } => m.kind === MediaKind.Video)
    .map((m) => m.video);
}

export function getThumb(media: Media): string {
  switch (media.kind) {
    case MediaKind.Photo:
      return media.photo.url;
    case MediaKind.Video:
      return media.video.thumb;
    case MediaKind.Gif:
      return media.gif.thumb;
  }
}
