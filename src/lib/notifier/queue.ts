import type { FollowerItem } from '../../types/common';

export function hasQueuedFollower(queue: FollowerItem[], userIdHash: string): boolean {
  return queue.some(item => item.user.userIdHash === userIdHash);
}

export function enqueueUniqueFollower(queue: FollowerItem[], follower: FollowerItem): boolean {
  if (hasQueuedFollower(queue, follower.user.userIdHash)) {
    return false;
  }

  queue.push(follower);
  return true;
}

export function enqueueUniqueFollowers(
  queue: FollowerItem[],
  followers: FollowerItem[]
): FollowerItem[] {
  const addedFollowers: FollowerItem[] = [];

  followers.forEach(follower => {
    if (enqueueUniqueFollower(queue, follower)) {
      addedFollowers.push(follower);
    }
  });

  return addedFollowers;
}

export function trimQueue(queue: FollowerItem[], maxSize: number): FollowerItem[] {
  return queue.slice(0, maxSize);
}

export function createDirectTestFollower(nickname = '테스트 유저'): FollowerItem {
  const now = Date.now();
  return {
    user: {
      userIdHash: `test_${now}`,
      nickname,
      profileImageUrl: '/default_profile.png',
    },
    followingSince: new Date().toISOString(),
  };
}
