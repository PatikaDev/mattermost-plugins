// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package scheduled

import (
	"encoding/json"

	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/pkg/errors"
)

const keyPrefix = "sm_"

// KVStore keeps each message under its own key in the plugin's KV store. Values are raw
// JSON bytes so CompareAndSwap compares exactly what was read.
type KVStore struct {
	kv *pluginapi.KVService
}

func NewKVStore(kv *pluginapi.KVService) *KVStore { return &KVStore{kv: kv} }

func (s *KVStore) Get(id string) (*Post, []byte, error) {
	var raw []byte
	if err := s.kv.Get(keyPrefix+id, &raw); err != nil {
		return nil, nil, errors.Wrap(err, "failed to read scheduled message")
	}
	if len(raw) == 0 {
		return nil, nil, nil
	}
	var p Post
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, nil, errors.Wrap(err, "failed to decode scheduled message")
	}
	return &p, raw, nil
}

func (s *KVStore) Put(p *Post) error {
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	_, err = s.kv.Set(keyPrefix+p.ID, raw)
	return errors.Wrap(err, "failed to save scheduled message")
}

func (s *KVStore) CompareAndSwap(old []byte, p *Post) (bool, error) {
	raw, err := json.Marshal(p)
	if err != nil {
		return false, err
	}
	ok, err := s.kv.Set(keyPrefix+p.ID, raw, pluginapi.SetAtomic(old))
	return ok, errors.Wrap(err, "failed to update scheduled message")
}

func (s *KVStore) Delete(id string) error {
	return errors.Wrap(s.kv.Delete(keyPrefix+id), "failed to delete scheduled message")
}

func (s *KVStore) All() ([]*Post, error) {
	const perPage = 200
	var posts []*Post
	for page := 0; ; page++ {
		keys, err := s.kv.ListKeys(page, perPage, pluginapi.WithPrefix(keyPrefix))
		if err != nil {
			return nil, errors.Wrap(err, "failed to list scheduled messages")
		}
		for _, key := range keys {
			p, _, err := s.Get(key[len(keyPrefix):])
			if err != nil {
				return nil, err
			}
			if p != nil {
				posts = append(posts, p)
			}
		}
		if len(keys) < perPage {
			return posts, nil
		}
	}
}
