// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package presence

import (
	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/pkg/errors"
)

const (
	trackedPrefix = "st_" // st_<userID> → Tracked
	joinPrefix    = "mj_" // mj_<userID> → MeetJoin
)

// KVStore keeps one entry per user in the plugin's KV store.
type KVStore struct {
	kv *pluginapi.KVService
}

func NewKVStore(kv *pluginapi.KVService) *KVStore { return &KVStore{kv: kv} }

func (s *KVStore) Tracked() (map[string]Tracked, error) {
	return readAll[Tracked](s.kv, trackedPrefix)
}

func (s *KVStore) SetTracked(userID string, t *Tracked) error {
	return set(s.kv, trackedPrefix+userID, t)
}

func (s *KVStore) MeetJoins() (map[string]MeetJoin, error) {
	return readAll[MeetJoin](s.kv, joinPrefix)
}

func (s *KVStore) SetMeetJoin(userID string, j *MeetJoin) error {
	return set(s.kv, joinPrefix+userID, j)
}

func set[T any](kv *pluginapi.KVService, key string, v *T) error {
	if v == nil {
		return errors.Wrap(kv.Delete(key), "failed to delete "+key)
	}
	_, err := kv.Set(key, v)
	return errors.Wrap(err, "failed to save "+key)
}

func readAll[T any](kv *pluginapi.KVService, prefix string) (map[string]T, error) {
	const perPage = 200
	out := map[string]T{}
	for page := 0; ; page++ {
		keys, err := kv.ListKeys(page, perPage, pluginapi.WithPrefix(prefix))
		if err != nil {
			return nil, errors.Wrap(err, "failed to list "+prefix)
		}
		for _, key := range keys {
			var v *T
			if err := kv.Get(key, &v); err != nil {
				return nil, errors.Wrap(err, "failed to read "+key)
			}
			if v != nil {
				out[key[len(prefix):]] = *v
			}
		}
		if len(keys) < perPage {
			return out, nil
		}
	}
}
